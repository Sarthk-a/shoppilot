import { useEffect, useState } from "react";
import "./MerchantDashboard.css";



function MerchantDashboard() {

  const loadAnalytics = async () => {
  try {
    setLoading(true);

    const response = await fetch(
      "http://localhost:8000/merchant/analytics"
    );

    if (!response.ok) {
      throw new Error(
        "Failed to load merchant analytics"
      );
    }

    const data = await response.json();

    setAnalytics(data);
  } catch (error) {
    console.error(
      "ANALYTICS LOAD ERROR:",
      error
    );
  } finally {
    setLoading(false);
  }
};

const [analytics, setAnalytics] = useState(null);

  const [loading, setLoading] = useState(true);

  const [orders, setOrders] =
    useState([]);

  const [audit, setAudit] =
    useState([]);

useEffect(() => {
  loadAnalytics();
}, []);

  useEffect(() => {

  const loadDashboard = async () => {

    try {

      const [ordersResponse, auditResponse] =
        await Promise.all([
          fetch("http://localhost:8000/orders"),
          fetch("http://localhost:8000/audit"),
        ]);

      const ordersData =
        await ordersResponse.json();

      const auditData =
        await auditResponse.json();

      setOrders(
        ordersData.orders || []
      );

      setAudit(
        auditData.events || []
      );

    } catch (error) {

      console.error(
        "DASHBOARD ERROR:",
        error
      );

    } finally {

      setLoading(false);

    }
  };

  loadDashboard();

}, []);

const authorizationCount =
  audit.filter(
    (event) =>
      event.event ===
      "UPSELL_AUTHORIZATION_CHECK"
  ).length;

const approvedUpsells =
  audit.filter(
    (event) =>
      event.event ===
      "UPSELL_APPROVED"
  ).length;

const upsellConversion =
  authorizationCount > 0
    ? Math.round(
        (approvedUpsells /
          authorizationCount) *
          100
      )
    : 0;
  const loadData = async () => {

    try {

      const ordersResponse =
        await fetch(
          "http://localhost:8000/orders"
        );

      const auditResponse =
        await fetch(
          "http://localhost:8000/audit"
        );

      const ordersData =
        await ordersResponse.json();

      const auditData =
        await auditResponse.json();

      setOrders(ordersData);

      setAudit(auditData);

    } catch (error) {

      console.error(error);

    }

  };


  const paidOrders = orders.filter(
  (order) => order.status === "PAID"
);

const revenue = paidOrders.reduce(
  (sum, order) =>
    sum + order.amount,
  0
);

const averageOrderValue =
  paidOrders.length > 0
    ? Math.round(
        revenue / paidOrders.length
      )
    : 0;

const upsellEvents =
  audit.filter(
    (event) =>
      event.event ===
      "UPSELL_AUTHORIZATION_CHECK"
  );

const upsellRevenue =
  upsellEvents.reduce(
    (sum, event) =>
      sum +
      (event.approved
        ? event.amount
        : 0),
    0
  );


  return (

    

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
    {paidOrders.length > 0
      ? "100%"
      : "0%"}
  </strong>
</div>

<div className="agent-status">
  <span className="agent-dot"></span>
  ShopPilot is active
</div>

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
  <div className="audit-section">

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

  <div className="section-heading">
    <h2>Agent activity</h2>
    <span>Live audit trail</span>
  </div>

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

      {event.amount && (
        <strong>
          ₹{event.amount.toLocaleString("en-IN")}
        </strong>
      )}

    </div>

  ))}

</div>
<div className="orders-section">

  <div className="section-heading">
    <h2>AI-assisted orders</h2>
  </div>

  {orders.map((order) => (

    <div
      className="order-row"
      key={order.id}
    >

      <div>
        <strong>
          {order.razorpay_order_id}
        </strong>

        <span>
          {order.items
            .map(
              (item) =>
                `${item.name} × ${item.quantity}`
            )
            .join(", ")}
        </span>
      </div>

      <div>
        <strong>
          ₹{order.amount.toLocaleString("en-IN")}
        </strong>

        <span>
          {order.status}
        </span>
      </div>

    </div>

  ))}

</div>

</div>


  );

}


export default MerchantDashboard;