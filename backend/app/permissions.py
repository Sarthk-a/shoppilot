class AgentPermissions:

    def __init__(
        self,
        max_purchase: int = 5000,
        max_upsell: int = 500,
        auto_upsell: bool = True,
        payment_confirmation: bool = True,
    ):
        self.max_purchase = max_purchase
        self.max_upsell = max_upsell
        self.auto_upsell = auto_upsell
        self.payment_confirmation = payment_confirmation

    def can_purchase(self, amount: int) -> bool:
        return amount <= self.max_purchase

    def can_upsell(self, amount: int) -> bool:
        return (
            self.auto_upsell
            and amount <= self.max_upsell
        )

    def summary(self):
        return {
            "max_purchase": self.max_purchase,
            "max_upsell": self.max_upsell,
            "auto_upsell": self.auto_upsell,
            "payment_confirmation": self.payment_confirmation,
        }


# Demo user permissions.
# Later this will come from PostgreSQL.

USER_PERMISSIONS = AgentPermissions(
    max_purchase=5000,
    max_upsell=500,
    auto_upsell=True,
    payment_confirmation=True,
)