import { createBrowserRouter } from "react-router";
import Login from "./features/auth/pages/Login";
import Register from "./features/auth/pages/Register";
import Home from "./features/auth/pages/Home";
import Protected from "./features/auth/components/Protected";
import Dashboard from "./features/auth/pages/Dashboard";
import Gallery from "./features/gallery/pages/Gallery";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <Home />
    },
    {
        path: "/gallery",
        element: <Gallery />
    },
    {
        path: "/dashboard",
        element: <Protected><Dashboard /></Protected>
    },
    {
        path: "/login",
        element: <Login />
    },
    {
        path: "/register",
        element: <Register />
    }
]);

