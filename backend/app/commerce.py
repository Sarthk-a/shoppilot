from .catalog import PRODUCTS

from .database import SessionLocal
from .models import Order

def get_usual_purchase():
    db = SessionLocal()

    try:
        order = (
            db.query(Order)
            .filter(Order.status == "PAID")
            .order_by(Order.created_at.desc())
            .first()
        )

        if not order:
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

    finally:
        db.close()

def find_product(product_id: str):
    for product in PRODUCTS:
        if product["id"] == product_id:
            return product
    return None


def get_complementary_products(
    cart_product_ids: list[str],
    max_upsell: int = 500,
):
    recommendations = []
    cart_products = [find_product(product_id) for product_id in cart_product_ids]
    cart_products = [product for product in cart_products if product is not None]
    if not cart_products:
        return []

    has_running_shoes = any(
        product["category"] == "running shoes" for product in cart_products
    )
    if not has_running_shoes:
        return []

    for product in PRODUCTS:
        if product["id"] in cart_product_ids:
            continue
        if product["category"] != "running accessories":
            continue
        if product["stock"] <= 0:
            continue
        if product["price"] > max_upsell:
            continue

        recommendations.append(
            {
                "product": product,
                "reason": "Complements your running purchase.",
            }
        )

    recommendations.sort(key=lambda item: item["product"]["price"])
    return recommendations[:3]


# -----------------------------
# CART TOOLS
# -----------------------------


def get_cart(cart: list[dict]):
    """Return the current cart."""
    return cart


def add_to_cart(
    cart: list[dict],
    product_id: str,
    quantity: int = 1,
):
    """Add a product to the cart."""
    if quantity <= 0:
        return {
            "success": False,
            "message": "Quantity must be greater than zero.",
            "cart": cart,
        }

    product = find_product(product_id)
    if product is None:
        return {
            "success": False,
            "message": "Product not found.",
            "cart": cart,
        }

    if product["stock"] <= 0:
        return {
            "success": False,
            "message": f"{product['name']} is out of stock.",
            "cart": cart,
        }

    existing_item = next(
        (item for item in cart if item["id"] == product_id),
        None,
    )

    if existing_item:
        new_quantity = existing_item["quantity"] + quantity
        if new_quantity > product["stock"]:
            return {
                "success": False,
                "message": "Requested quantity exceeds available stock.",
                "cart": cart,
            }
        existing_item["quantity"] = new_quantity
    else:
        cart.append(
            {
                "id": product["id"],
                "name": product["name"],
                "brand": product["brand"],
                "price": product["price"],
                "quantity": quantity,
            }
        )

    return {
        "success": True,
        "message": f"{product['name']} added to cart.",
        "cart": cart,
    }


def remove_from_cart(
    cart: list[dict],
    product_id: str,
):
    """Remove a product from the cart."""
    new_cart = [item for item in cart if item["id"] != product_id]
    return {
        "success": len(new_cart) != len(cart),
        "cart": new_cart,
    }


def calculate_cart_total(cart: list[dict]):
    """Calculate the current cart total."""
    return sum(item["price"] * item["quantity"] for item in cart)