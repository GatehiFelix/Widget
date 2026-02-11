import { Provider } from "react-redux";

import { ToastContainer} from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
// import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

import store from "./store";


const router = createBrowserRouter([
  {
    path: "/",
    element: <Index />,
    errorElement: <NotFound />,
  }
])

const App = () => {
  return (
      <Provider store={store}>
        <RouterProvider router={router} />
        <ToastContainer 
          position="top-right"
          autoClose={3000}
          hideProgressBar
        />
      </Provider>
  )
};

export default App;