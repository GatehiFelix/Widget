const useWidgetConfig = () => {
  const productId = Number(localStorage.getItem("widget_product_id")) || null;
  const clientId  = Number(localStorage.getItem("widget_client_id"))  || null;
  const widgetKey = localStorage.getItem("widget_key") || null;

  return { productId, clientId, widgetKey };
};

export default useWidgetConfig;