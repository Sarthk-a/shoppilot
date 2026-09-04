from .database import SessionLocal
from .models import CustomerPreference

DEMO_CUSTOMER_ID = "demo_customer"


def get_customer_preferences():
    db = SessionLocal()

    try:
        preferences = (
            db.query(CustomerPreference)
            .filter(
                CustomerPreference.customer_id
                == DEMO_CUSTOMER_ID
            )
            .all()
        )

        return {
            preference.key: preference.value
            for preference in preferences
        }

    finally:
        db.close()


def save_customer_preference(
    key: str,
    value: str,
):
    db = SessionLocal()

    try:
        preference = (
            db.query(CustomerPreference)
            .filter(
                CustomerPreference.customer_id
                == DEMO_CUSTOMER_ID,
                CustomerPreference.key == key,
            )
            .first()
        )

        if preference:
            preference.value = value
        else:
            preference = CustomerPreference(
                customer_id=DEMO_CUSTOMER_ID,
                key=key,
                value=value,
            )

            db.add(preference)

        db.commit()

        return {
            "success": True,
            "key": key,
            "value": value,
        }

    finally:
        db.close()