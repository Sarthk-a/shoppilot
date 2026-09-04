import os
import re
import uuid
import hmac
import hashlib
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import razorpay

from google.adk.runners import InMemoryRunner
from google.genai import types

from .database import Base, engine, get_db
from .models import (
    Order,
    AuditEvent,
    Authorization,
    MerchantSettings,
)
from .permissions import USER_PERMISSIONS, AgentPermissions
from .preferences import (
    get_customer_preferences,
    save_customer_preference,
)
from .agent import root_agent
from .catalog import search_products, PRODUCTS
from .commerce import (
    get_cart,
    add_to_cart,
    remove_from_cart,
    calculate_cart_total,
    get_complementary_products,
)

load_dotenv()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

# --------------------------------------------------
# FastAPI App Setup
# --------------------------------------------------

app = FastAPI(title="ShopPilot API")

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# Configuration
# --------------------------------------------------

APP_NAME = "shoppilot"
USER_ID = "demo_user"

razorpay_client = razorpay.Client(
    auth=(
        RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET,
    )
)

runner = InMemoryRunner(
    app_name=APP_NAME,
    agent=root_agent,
)

AUTHORIZATIONS = {}
AUDIT_LOG = []
ORDERS = []


AGENT_PERMISSIONS = AgentPermissions(
    max_purchase=5000,
    max_upsell=500,
    auto_upsell=True,
    payment_confirmation=True,
)

# --------------------------------------------------
# Request / Response models
# --------------------------------------------------

class MerchantAnalyticsResponse(BaseModel):
    total_revenue: float
    order_count: int
    average_order_value: float
    upsell_revenue: float
    total_authorizations: int
    approved_authorizations: int
    upsell_conversion: float
    agent_assisted_revenue: float
    recent_activity: list[dict]


class MerchantSettingsRequest(BaseModel):
    max_purchase: int
    max_upsell: int
    auto_upsell: bool
    payment_confirmation: bool


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    products: list[dict] = []


class CartItem(BaseModel):
    product_id: str
    quantity: int = 1


class UpsellRequest(BaseModel):
    items: list[CartItem]


class CreateOrderRequest(BaseModel):
    items: list[CartItem]


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class CartRequest(BaseModel):
    items: list[CartItem]


class RemoveCartItemRequest(BaseModel):
    product_id: str


class AuthorizationRequest(BaseModel):
    product_id: str
    amount: int
    max_upsell_limit: int
    quantity: int = 1


class AuthorizationResponse(BaseModel):
    authorization_id: str
    approved: bool
    product: dict
    amount: int
    reason: str


class ApproveUpsellRequest(BaseModel):
    authorization_id: str


class PreferenceRequest(BaseModel):
    key: str
    value: str


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def create_audit_event(
    db: Session,
    event: str,
    order_id: str = None,
    authorization_id: str = None,
    amount: float = None,
    metadata: dict = None,
):
    audit_event = AuditEvent(
        event=event,
        order_id=order_id,
        authorization_id=authorization_id,
        amount=amount,
        metadata_json=metadata,
    )

    db.add(audit_event)
    db.commit()


def extract_max_price(message: str):
    patterns = [
        r"(?:under|below|less than|up to|upto)\s*₹?\s*([\d,]+)",
        r"₹\s*([\d,]+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, message.lower())

        if match:
            return int(
                match.group(1).replace(",", "")
            )

    return None


def find_product(product_id: str):
    for product in PRODUCTS:
        if product["id"] == product_id:
            return product

    return None


# --------------------------------------------------
# Merchant settings
# --------------------------------------------------

def get_or_create_merchant_settings(db):
    settings = db.query(MerchantSettings).first()

    if settings is None:
        settings = MerchantSettings(
            max_purchase=5000,
            max_upsell=500,
            auto_upsell=True,
            payment_confirmation=True,
        )

        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


@app.get("/merchant/settings")
def get_merchant_settings(
    db=Depends(get_db),
):
    settings = get_or_create_merchant_settings(db)

    return {
        "max_purchase": settings.max_purchase,
        "max_upsell": settings.max_upsell,
        "auto_upsell": settings.auto_upsell,
        "payment_confirmation": settings.payment_confirmation,
    }


@app.put("/merchant/settings")
def update_merchant_settings(
    request: MerchantSettingsRequest,
    db=Depends(get_db),
):
    if request.max_purchase <= 0:
        raise HTTPException(
            status_code=400,
            detail="Maximum purchase must be greater than zero.",
        )

    if request.max_upsell < 0:
        raise HTTPException(
            status_code=400,
            detail="Maximum upsell cannot be negative.",
        )

    settings = get_or_create_merchant_settings(db)

    settings.max_purchase = request.max_purchase
    settings.max_upsell = request.max_upsell
    settings.auto_upsell = request.auto_upsell
    settings.payment_confirmation = request.payment_confirmation

    db.commit()
    db.refresh(settings)

    create_audit_event(
        db=db,
        event="MERCHANT_RULES_UPDATED",
        metadata={
            "max_purchase": settings.max_purchase,
            "max_upsell": settings.max_upsell,
            "auto_upsell": settings.auto_upsell,
            "payment_confirmation": settings.payment_confirmation,
        },
    )

    return {
        "success": True,
        "max_purchase": settings.max_purchase,
        "max_upsell": settings.max_upsell,
        "auto_upsell": settings.auto_upsell,
        "payment_confirmation": settings.payment_confirmation,
    }


# --------------------------------------------------
# Cart helpers
# --------------------------------------------------

def calculate_cart(items):
    cart_items = []
    total = 0

    for item in items:
        product = find_product(item.product_id)

        if not product:
            raise HTTPException(
                status_code=400,
                detail=f"Product {item.product_id} not found",
            )

        if item.quantity < 1:
            raise HTTPException(
                status_code=400,
                detail="Quantity must be at least 1",
            )

        if item.quantity > product["stock"]:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Not enough stock for "
                    f"{product['name']}"
                ),
            )

        item_total = product["price"] * item.quantity
        total += item_total

        cart_items.append(
            {
                "id": product["id"],
                "name": product["name"],
                "brand": product["brand"],
                "price": product["price"],
                "quantity": item.quantity,
                "total": item_total,
            }
        )

    return cart_items, total


# --------------------------------------------------
# Customer preferences
# --------------------------------------------------

@app.get("/preferences")
def get_preferences():
    return get_customer_preferences()


@app.post("/preferences")
def save_preference(
    request: PreferenceRequest,
):
    return save_customer_preference(
        request.key,
        request.value,
    )


# --------------------------------------------------
# Home & Cart Routes
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "status": "ok",
        "message": "ShopPilot API is running",
    }


@app.post("/cart")
def cart(request: CartRequest):
    cart = []

    for item in request.items:
        result = add_to_cart(
            cart,
            item.product_id,
            item.quantity,
        )

        if not result["success"]:
            raise HTTPException(
                status_code=400,
                detail=result["message"],
            )

    return {
        "items": cart,
        "total": calculate_cart_total(cart),
    }


@app.post("/cart/add")
def cart_add(request: CartItem):
    cart = []

    result = add_to_cart(
        cart,
        request.product_id,
        request.quantity,
    )

    if not result["success"]:
        raise HTTPException(
            status_code=400,
            detail=result["message"],
        )

    return {
        "success": True,
        "items": result["cart"],
        "total": calculate_cart_total(
            result["cart"]
        ),
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ShopPilot API",
    }


# --------------------------------------------------
# Orders & Checkout
# --------------------------------------------------

@app.post("/create-order")
def create_order(
    request: CreateOrderRequest,
    db: Session = Depends(get_db),
):
    total = 0
    validated_items = []

    for item in request.items:
        product = next(
            (
                p
                for p in PRODUCTS
                if p["id"] == item.product_id
            ),
            None,
        )

        if product is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Product {item.product_id} "
                    f"not found."
                ),
            )

        if item.quantity <= 0:
            raise HTTPException(
                status_code=400,
                detail="Quantity must be greater than zero.",
            )

        if item.quantity > product["stock"]:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient stock for "
                    f"{product['name']}."
                ),
            )

        total += product["price"] * item.quantity

        validated_items.append(
            {
                "id": product["id"],
                "name": product["name"],
                "price": product["price"],
                "quantity": item.quantity,
            }
        )

    settings = get_or_create_merchant_settings(db)

    # Merchant-configured purchase limit
    if total > settings.max_purchase:
        create_audit_event(
            db=db,
            event="ORDER_BLOCKED_BY_POLICY",
            amount=total,
            metadata={
                "max_purchase": settings.max_purchase,
            },
        )

        raise HTTPException(
            status_code=400,
            detail=(
                f"Order total ₹{total} exceeds the "
                f"₹{settings.max_purchase} purchase limit."
            ),
        )

    receipt = (
        f"shoppilot_"
        f"{uuid.uuid4().hex[:12]}"
    )

    try:
        razorpay_order = (
            razorpay_client.order.create(
                {
                    "amount": total * 100,
                    "currency": "INR",
                    "receipt": receipt,
                }
            )
        )

    except Exception as error:
        print(
            "RAZORPAY ORDER ERROR:",
            error,
        )

        create_audit_event(
            db=db,
            event="ORDER_CREATION_FAILED",
            amount=total,
            metadata={
                "error": str(error),
            },
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to create payment order.",
        )

    internal_order_id = str(
        uuid.uuid4()
    )

    order = Order(
        id=internal_order_id,
        razorpay_order_id=razorpay_order["id"],
        amount=total,
        status="ORDER_CREATED",
        items=validated_items,
    )

    db.add(order)
    db.commit()
    db.refresh(order)

    create_audit_event(
        db=db,
        event="ORDER_CREATED",
        order_id=order.id,
        amount=order.amount,
        metadata={
            "razorpay_order_id":
                order.razorpay_order_id,
            "items": validated_items,
        },
    )

    return {
        "order_id": internal_order_id,
        "razorpay_order_id":
            razorpay_order["id"],
        "amount": total,
        "currency": "INR",
        "key_id": RAZORPAY_KEY_ID,
        "items": validated_items,
    }


@app.post("/verify-payment")
def verify_payment(
    request: VerifyPaymentRequest,
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(
            Order.razorpay_order_id
            == request.razorpay_order_id
        )
        .first()
    )

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    generated_signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        (
            f"{order.razorpay_order_id}|"
            f"{request.razorpay_payment_id}"
        ).encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(
        generated_signature,
        request.razorpay_signature,
    ):
        order.status = (
            "PAYMENT_VERIFICATION_FAILED"
        )

        db.commit()

        create_audit_event(
            db=db,
            event="PAYMENT_FAILED",
            order_id=order.id,
            amount=order.amount,
            metadata={
                "reason":
                    "Payment signature verification failed",
            },
        )

        raise HTTPException(
            status_code=400,
            detail="Payment verification failed.",
        )

    order.status = "PAID"
    order.razorpay_payment_id = (
        request.razorpay_payment_id
    )
    order.paid_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(order)

    create_audit_event(
        db=db,
        event="PAYMENT_VERIFIED",
        order_id=order.id,
        amount=order.amount,
        metadata={
            "razorpay_payment_id":
                request.razorpay_payment_id,
        },
    )

    return {
        "success": True,
        "status": "PAID",
        "order_id": order.id,
        "payment_id":
            request.razorpay_payment_id,
        "amount": order.amount,
    }


# --------------------------------------------------
# Upsell & Authorization
# --------------------------------------------------

@app.post("/upsell")
def upsell(
    request: UpsellRequest,
    db=Depends(get_db),
):
    try:
        settings = get_or_create_merchant_settings(
            db
        )

        if not settings.auto_upsell:
            return {
                "recommendations": [],
                "message": "Upselling is disabled.",
            }

        product_ids = [
            item.product_id
            for item in request.items
        ]

        recommendations = (
            get_complementary_products(
                product_ids,
                max_upsell=settings.max_upsell,
            )
        )

        return {
            "recommendations":
                recommendations
        }

    except Exception as error:
        print(
            "UPSELL ERROR:",
            error,
        )

        create_audit_event(
            db=db,
            event="UPSELL_SERVICE_FAILED",
            metadata={
                "error": str(error),
            },
        )

        return {
            "recommendations": [],
            "fallback": True,
            "message": (
                "Upsell recommendations are "
                "temporarily unavailable. "
                "Your existing cart is unaffected."
            ),
        }


@app.post("/authorize-upsell")
def authorize_upsell(
    request: AuthorizationRequest,
    db=Depends(get_db),
):
    settings = get_or_create_merchant_settings(
        db
    )

    product = find_product(
        request.product_id
    )

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    if not settings.auto_upsell:
        return {
            "approved": False,
            "reason": (
                "Automatic upselling is "
                "currently disabled."
            ),
        }

    amount = (
        product["price"]
        * request.quantity
    )

    if amount > settings.max_upsell:
        create_audit_event(
            db=db,
            event="UPSELL_AUTHORIZATION_DENIED",
            amount=amount,
            metadata={
                "product_id":
                    product["id"],
                "reason":
                    "Exceeded merchant upsell limit",
                "max_upsell":
                    settings.max_upsell,
            },
        )

        return {
            "approved": False,
            "reason": (
                f"This addition costs ₹{amount}, "
                f"which exceeds the merchant's ₹"
                f"{settings.max_upsell} "
                f"upsell limit."
            ),
        }

    authorization = Authorization(
        id=str(uuid4()),
        product_id=product["id"],
        amount=amount,
        policy_approved=True,
        approved=False,
    )

    db.add(authorization)
    db.commit()
    db.refresh(authorization)

    create_audit_event(
        db=db,
        event="UPSELL_AUTHORIZATION_CHECK",
        authorization_id=authorization.id,
        amount=amount,
        metadata={
            "product_id":
                product["id"],
            "max_upsell":
                settings.max_upsell,
        },
    )

    return {
        "approved": True,
        "authorization_id":
            authorization.id,
        "product": product,
        "amount": amount,
        "reason": (
            f"This addition complements "
            f"your purchase and is within "
            f"the ₹{settings.max_upsell} "
            f"upsell limit."
        ),
    }


@app.post("/approve-upsell")
def approve_upsell(
    request: ApproveUpsellRequest,
    db: Session = Depends(get_db),
):
    authorization = (
        db.query(Authorization)
        .filter(
            Authorization.id
            == request.authorization_id
        )
        .first()
    )

    if authorization is None:
        raise HTTPException(
            status_code=404,
            detail="Authorization not found",
        )

    if not authorization.policy_approved:
        return {
            "approved": False,
            "reason": (
                "This upsell was not approved "
                "by the agent policy."
            ),
        }

    if authorization.approved:
        return {
            "approved": True,
            "reason": (
                "This authorization was "
                "already approved."
            ),
        }

    authorization.approved = True
    authorization.approved_at = (
        datetime.utcnow()
    )

    db.commit()

    create_audit_event(
        db=db,
        event="UPSELL_APPROVED",
        authorization_id=authorization.id,
        amount=authorization.amount,
        metadata={
            "product_id":
                authorization.product_id,
        },
    )

    return {
        "approved": True,
        "authorization_id":
            authorization.id,
        "product_id":
            authorization.product_id,
        "amount":
            authorization.amount,
        "reason":
            "Upsell approved by customer.",
    }


# --------------------------------------------------
# Reorder
# --------------------------------------------------

@app.get("/reorder")
def reorder(
    db=Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.status == "PAID")
        .order_by(Order.created_at.desc())
        .first()
    )

    if order is None:
        return {
            "found": False,
            "items": [],
        }

    return {
        "found": True,
        "items": order.items,
        "created_at": (
            order.created_at.isoformat()
            if order.created_at
            else None
        ),
    }


# --------------------------------------------------
# Analytics & Admin
# --------------------------------------------------

@app.get(
    "/merchant/analytics",
    response_model=MerchantAnalyticsResponse,
)
def merchant_analytics(
    db: Session = Depends(get_db),
):
    orders = db.query(Order).all()

    paid_orders = [
        o
        for o in orders
        if o.status == "PAID"
    ]

    total_revenue = float(
        sum(
            o.amount
            for o in paid_orders
        )
    )

    order_count = len(
        paid_orders
    )

    average_order_value = (
        total_revenue / order_count
        if order_count > 0
        else 0.0
    )

    authorizations = (
        db.query(Authorization).all()
    )

    total_authorizations = len(
        authorizations
    )

    approved_authorizations = len(
        [
            a
            for a in authorizations
            if a.approved
        ]
    )

    upsell_conversion = (
        (
            approved_authorizations
            / total_authorizations
            * 100
        )
        if total_authorizations > 0
        else 0.0
    )

    upsell_revenue = float(
        sum(
            a.amount
            for a in authorizations
            if a.approved
        )
    )

    recent_events = (
        db.query(AuditEvent)
        .order_by(
            AuditEvent.created_at.desc()
        )
        .limit(10)
        .all()
    )

    recent_activity = [
        {
            "id": event.id,
            "event": event.event,
            "order_id": event.order_id,
            "authorization_id":
                event.authorization_id,
            "amount": event.amount,
            "timestamp": (
                event.created_at.isoformat()
                if event.created_at
                else None
            ),
        }
        for event in recent_events
    ]

    return MerchantAnalyticsResponse(
        total_revenue=
            total_revenue,
        order_count=
            order_count,
        average_order_value=
            round(
                average_order_value,
                2,
            ),
        upsell_revenue=
            upsell_revenue,
        total_authorizations=
            total_authorizations,
        approved_authorizations=
            approved_authorizations,
        upsell_conversion=
            round(
                upsell_conversion,
                2,
            ),
        agent_assisted_revenue=
            total_revenue,
        recent_activity=
            recent_activity,
    )


@app.get("/products")
def get_products():
    return PRODUCTS


@app.get("/audit")
def get_audit(
    db: Session = Depends(get_db),
):
    events = (
        db.query(AuditEvent)
        .order_by(
            AuditEvent.created_at.desc()
        )
        .all()
    )

    return {
        "events": [
            {
                "id": event.id,
                "event": event.event,
                "order_id":
                    event.order_id,
                "authorization_id":
                    event.authorization_id,
                "amount":
                    event.amount,
                "metadata":
                    event.metadata_json,
                "timestamp": (
                    event.created_at.isoformat()
                    if event.created_at
                    else None
                ),
            }
            for event in events
        ]
    }


@app.get("/orders")
def get_orders(
    db: Session = Depends(get_db),
):
    orders = (
        db.query(Order)
        .order_by(
            Order.created_at.desc()
        )
        .all()
    )

    result = []

    for order in orders:
        result.append(
            {
                "id":
                    order.id,
                "razorpay_order_id":
                    order.razorpay_order_id,
                "razorpay_payment_id":
                    order.razorpay_payment_id,
                "amount":
                    order.amount,
                "status":
                    order.status,
                "items":
                    order.items,
                "created_at": (
                    order.created_at.isoformat()
                    if order.created_at
                    else None
                ),
                "paid_at": (
                    order.paid_at.isoformat()
                    if order.paid_at
                    else None
                ),
            }
        )

    paid_orders = [
        o
        for o in orders
        if o.status == "PAID"
    ]

    revenue = sum(
        o.amount
        for o in paid_orders
    )

    return {
        "orders": result,
        "total_orders":
            len(orders),
        "paid_orders":
            len(paid_orders),
        "revenue":
            revenue,
    }


# --------------------------------------------------
# Chat
# --------------------------------------------------

@app.post(
    "/chat",
    response_model=ChatResponse,
)
async def chat(
    request: ChatRequest,
):
    if (
        os.getenv(
            "USE_MOCK_AGENT",
            ""
        ).lower()
        == "true"
    ):
        message = request.message.lower()

        max_price = extract_max_price(
            message
        )

        if "accessor" in message:
            products = [
                p
                for p in PRODUCTS
                if (
                    p["category"]
                    == "running accessories"
                    and (
                        max_price is None
                        or p["price"]
                        <= max_price
                    )
                )
            ][:3]

            response = (
                "Since you're getting "
                "running gear, these "
                "accessories would be useful. "
                "I've kept them within your "
                "budget."
            )

        elif "asics" in message:
            asics = find_product(
                "shoe_001"
            )

            products = (
                [asics]
                if asics
                else []
            )

            response = (
                "Good choice. The ASICS "
                "Gel-Contend 9 is a strong "
                "option for daily running."
            )

        elif "nike" in message:
            nike = find_product(
                "shoe_002"
            )

            products = (
                [nike]
                if nike
                else []
            )

            response = (
                "The Nike Revolution 7 is "
                "a lightweight option that "
                "fits your budget."
            )

        elif "puma" in message:
            puma = find_product(
                "shoe_003"
            )

            products = (
                [puma]
                if puma
                else []
            )

            response = (
                "The Puma Velocity Nitro "
                "is the performance-focused "
                "option."
            )

        else:
            products = search_products(
                request.message,
                max_price,
            )

            response = (
                "Here are some great options "
                "that match your request:"
            )

        return ChatResponse(
            response=response,
            session_id=(
                request.session_id
                or "mock-session"
            ),
            products=products,
        )

    # ---------------------------------------
    # Gemini / ADK session
    # ---------------------------------------

    if request.session_id:
        session = (
            await runner.session_service.get_session(
                app_name=APP_NAME,
                user_id=USER_ID,
                session_id=request.session_id,
            )
        )

        if session is None:
            session = (
                await runner.session_service.create_session(
                    app_name=APP_NAME,
                    user_id=USER_ID,
                    session_id=request.session_id,
                )
            )

    else:
        session = (
            await runner.session_service.create_session(
                app_name=APP_NAME,
                user_id=USER_ID,
            )
        )

    content = types.Content(
        role="user",
        parts=[
            types.Part.from_text(
                text=request.message
            )
        ],
    )

    response_text = ""
    products = []

    async for event in runner.run_async(
        user_id=USER_ID,
        session_id=session.id,
        new_message=content,
    ):
        if (
            not event.content
            or not event.content.parts
        ):
            continue

        for part in event.content.parts:

            if part.text:
                response_text = part.text

            if part.function_response:
                func_resp = part.function_response

                if func_resp.name == "search_products":
                    result = func_resp.response

                    if isinstance(result, dict):
                        products = result.get(
                            "result",
                            result.get("products", [])
                        )

                    elif isinstance(result, list):
                        products = result

    # ---------------------------------------
    # Reliable catalog fallback
    # ---------------------------------------
    # If the agent understood this as a product
    # discovery request but ADK did not expose the
    # search tool result to us, search the catalog
    # directly so the frontend still receives products.

    if not products:
        message = request.message.lower()

        discovery_words = [
            "find",
            "search",
            "show",
            "need",
            "looking for",
            "recommend",
            "recommendation",
            "want",
            "buy",
            "get me",
        ]

        product_words = [
            "shoe",
            "shoes",
            "running",
            "nike",
            "asics",
            "puma",
            "bottle",
            "socks",
            "accessory",
            "accessories",
        ]

        is_discovery_request = (
            any(word in message for word in discovery_words)
            and any(word in message for word in product_words)
        ) or any(
            word in message
            for word in [
                "running shoes",
                "running shoe",
                "nike shoes",
                "asics shoes",
                "puma shoes",
            ]
        )

        if is_discovery_request:
            max_price = extract_max_price(
                request.message
            )

            products = search_products(
                request.message,
                max_price,
            )

    if not response_text:
        response_text = (
            "Here are some options that match your request:"
        )

    return ChatResponse(
        response=response_text,
        session_id=session.id,
        products=products,
    )


# --------------------------------------------------
# Webhooks & Failures
# --------------------------------------------------

@app.post("/payment-failed")
def payment_failed(
    data: dict,
    db: Session = Depends(get_db),
):
    razorpay_order_id = data.get(
        "razorpay_order_id"
    )

    order = (
        db.query(Order)
        .filter(
            Order.razorpay_order_id
            == razorpay_order_id
        )
        .first()
    )

    if order:
        order.status = "FAILED"
        db.commit()

        create_audit_event(
            db=db,
            event="PAYMENT_FAILED",
            order_id=order.id,
            amount=order.amount,
            metadata={
                "reason": data.get(
                    "reason",
                    "Customer payment failed.",
                ),
            },
        )

    return {
        "success": False,
        "message": (
            "Payment failed. "
            "Your cart is still saved."
        ),
    }


@app.post("/webhook/razorpay")
async def razorpay_webhook(
    request: Request,
):
    payload = await request.body()

    signature = request.headers.get(
        "X-Razorpay-Signature"
    )

    if not signature:
        raise HTTPException(
            status_code=400,
            detail="Missing webhook signature.",
        )

    webhook_secret = os.getenv(
        "RAZORPAY_WEBHOOK_SECRET"
    )

    if not webhook_secret:
        raise HTTPException(
            status_code=500,
            detail=(
                "RAZORPAY_WEBHOOK_SECRET "
                "is not configured."
            ),
        )

    generated_signature = hmac.new(
        webhook_secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(
        generated_signature,
        signature,
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid webhook signature.",
        )

    data = await request.json()

    event = data.get("event")

    AUDIT_LOG.append(
        {
            "event":
                f"RAZORPAY_WEBHOOK_{event}",
            "timestamp":
                datetime.now(timezone.utc),
        }
    )

    return {
        "success": True
    }