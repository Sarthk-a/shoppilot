from datetime import datetime, timedelta

from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import DateTime
from sqlalchemy import JSON
from sqlalchemy import Boolean

from .database import Base


class Order(Base):

    __tablename__ = "orders"

    id = Column(
        String,
        primary_key=True,
    )

    razorpay_order_id = Column(
        String,
        unique=True,
        nullable=False,
    )

    razorpay_payment_id = Column(
        String,
        nullable=True,
    )

    amount = Column(
        Integer,
        nullable=False,
    )

    status = Column(
        String,
        nullable=False,
        default="ORDER_CREATED",
    )

    items = Column(
        JSON,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    paid_at = Column(
        DateTime,
        nullable=True,
    )

class MerchantSettings(Base):
    __tablename__ = "merchant_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)

    max_purchase = Column(Integer, nullable=False, default=5000)
    max_upsell = Column(Integer, nullable=False, default=500)

    auto_upsell = Column(Boolean, nullable=False, default=True)
    payment_confirmation = Column(Boolean, nullable=False, default=True)

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

class AuditEvent(Base):

    __tablename__ = "audit_events"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    event = Column(
        String,
        nullable=False,
    )

    order_id = Column(
        String,
        nullable=True,
    )

    authorization_id = Column(
        String,
        nullable=True,
    )

    amount = Column(
        Integer,
        nullable=True,
    )

    metadata_json = Column(
        JSON,
        nullable=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )


class Authorization(Base):

    __tablename__ = "authorizations"

    id = Column(
        String,
        primary_key=True,
    )

    product_id = Column(
        String,
        nullable=False,
    )

    amount = Column(
        Integer,
        nullable=False,
    )

    policy_approved = Column(
        Boolean,
        default=False,
    )

    approved = Column(
        Boolean,
        default=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
    )

    approved_at = Column(
        DateTime,
        nullable=True,
    )

    #customer preference

class CustomerPreference(Base):
    __tablename__ = "customer_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)

    customer_id = Column(
        String,
        nullable=False,
        default="demo_customer"
    )

    key = Column(String, nullable=False)
    value = Column(String, nullable=False)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )