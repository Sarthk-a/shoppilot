import { useEffect, useState } from "react";
import "./MerchantDashboard.css";

function MerchantDashboard() {
  const [orders, setOrders] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const [ordersResponse, auditResponse] = await Promise.all([
        fetch("http://localhost:8000/orders"),
        fetch("http://localhost:8000/audit"),
      ]);

      if (!ordersResponse.ok || !auditResponse.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const ordersData = await ordersResponse.json();
      const auditData = await auditResponse.json();

      setOrders(ordersData.orders || []);
      setAudit(auditData.events || []);
    } catch (error) {
      console.error("DASHBOARD ERROR:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const paidOrders = orders.filter(
    (order) => order.status === "PAID"
  );

  const revenue = paidOrders.reduce(
    (sum, order) => sum + Number(order.amount || 0),
    0
  );

  const averageOrderValue =
    paidOrders.length > 0
      ? Math.round(revenue / paidOrders.length)
      : 0;

  const authorizationCount = audit.filter(
    (event) =>
      event.event === "UPSELL_AUTHORIZATION_CHECK"
  ).length;

  const approvedUpsells = audit.filter(
    (event) =>
      event.event === "UPSELL_APPROVED"
  );

  const approvedUpsellCount = approvedUpsells.length;

  const upsellConversion =
    authorizationCount > 0
      ? Math.round(
          (approvedUpsellCount / authorizationCount) * 100
        )
      : 0;

  const upsellRevenue = approvedUpsells.reduce(
    (sum, event) => sum + Number(event.amount || 0),
    0
  );

  return (
    <div className="dashboard">

      {/* HEADER */}
      <div className="dashboard-header">
        <div>
          <span>MERCHANT CONSOLE</span>
          <h1>ShopPilot Analytics</h1>
        </div>

        <button onClick={loadDashboard}>
          Refresh
        </button>
      </div>

      {/* TOP METRICS */}
      <div className="dashboard-metrics">

        <div className="metric-card">
          <span>AI Revenue</span>
          <strong>
            ₹{revenue.toLocaleString("en-IN")}
          </strong>
        </div>

        <div className="metric-card">
          <span>AI Orders</span>
          <strong>
            {paidOrders.length}
          </strong>
        </div>

        <div className="metric-card">
          <span>Upsell Conversion</span>
          <strong>
            {upsellConversion}%
          </strong>
        </div>

        <div className="metric-card">
          <span>Agent-assisted Revenue</span>
          <strong>
            {paidOrders.length > 0 ? "100%" : "0%"}
          </strong>
        </div>

      </div>

      {/* MAIN DASHBOARD */}
      <div className="dashboard-content">

        {/* LEFT COLUMN */}
        <div className="dashboard-main">

          <div className="secondary-metrics">

            <div className="metric-card">
              <span>Average Order Value</span>
              <strong>
                ₹{averageOrderValue.toLocaleString("en-IN")}
              </strong>
            </div>

            <div className="metric-card">
              <span>Upsell Revenue</span>
              <strong>
                ₹{upsellRevenue.toLocaleString("en-IN")}
              </strong>
            </div>

          </div>

          {/* ORDERS */}
          <div className="dashboard-section orders-section">

            <div className="section-heading">
              <div>
                <h2>AI-assisted orders</h2>
                <span>
                  Orders completed through ShopPilot
                </span>
              </div>

              <span>
                {paidOrders.length} paid
              </span>
            </div>

            {loading ? (
              <div className="empty">
                Loading orders...
              </div>
            ) : orders.length === 0 ? (
              <div className="empty">
                No orders yet.
              </div>
            ) : (
              <div className="orders">

                {orders.map((order) => (
                  <div
                    className="order-row"
                    key={order.id}
                  >

                    <div className="order-info">
                      <strong>
                        {order.razorpay_order_id}
                      </strong>

                      <span>
                        {order.items
                          ?.map(
                            (item) =>
                              `${item.name} × ${item.quantity}`
                          )
                          .join(", ")}
                      </span>
                    </div>

                    <div className="order-meta">
                      <strong>
                        ₹{Number(order.amount || 0).toLocaleString("en-IN")}
                      </strong>

                      <span className="status">
                        {order.status}
                      </span>
                    </div>

                  </div>
                ))}

              </div>
            )}

          </div>

        </div>

        {/* RIGHT COLUMN */}
        <aside className="dashboard-sidebar">

          {/* AGENT STATUS */}
          <div className="agent-card">

            <div className="agent-status">
              <span className="agent-dot"></span>
              ShopPilot is active
            </div>

            <p>
              AI shopping agent is available for customers.
            </p>

          </div>

          {/* PERMISSIONS */}
          <div className="permission-summary">

            <span>SHOPPILOT PERMISSIONS</span>

            <div>
              <strong>Purchase limit</strong>
              <span>₹5,000</span>
            </div>

            <div>
              <strong>Auto-upsell</strong>
              <span>Up to ₹500</span>
            </div>

            <div>
              <strong>Payment</strong>
              <span>Confirmation required</span>
            </div>

          </div>

          {/* AUDIT */}
          <div className="dashboard-section audit-section">

            <div className="section-heading">
              <div>
                <h2>Agent activity</h2>
                <span>Live audit trail</span>
              </div>
            </div>

            {loading ? (
              <div className="empty">
                Loading activity...
              </div>
            ) : audit.length === 0 ? (
              <div className="empty">
                No agent activity yet.
              </div>
            ) : (
              <div className="activity">

                {audit.map((event, index) => (
                  <div
                    className="audit-row"
                    key={index}
                  >

                    <div>
                      <strong>
                        {event.event}
                      </strong>

                      <span>
                        {event.timestamp}
                      </span>
                    </div>

                    {event.amount ? (
                      <strong>
                        ₹{Number(event.amount).toLocaleString("en-IN")}
                      </strong>
                    ) : null}

                  </div>
                ))}

              </div>
            )}

          </div>

        </aside>

      </div>

    </div>
  );
}

export default MerchantDashboard;