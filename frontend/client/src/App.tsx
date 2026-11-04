import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import WelcomeAuth from "@/pages/WelcomeAuth";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AIProvider } from "./contexts/AIContext";
import { SidebarLayout } from "./components/SidebarLayout";

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Component /> : <Redirect to="/welcome" />;
}

function AlertsRoute() {
  return <SidebarLayout initialTab="alerts" />;
}

function ReportsRoute() {
  return <SidebarLayout initialTab="reports" />;
}

function LogsRoute() {
  return <SidebarLayout initialTab="logs" />;
}

function NodesRoute() {
  return <SidebarLayout initialTab="nodes" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/welcome" component={WelcomeAuth} />
      <Route path="/login" component={Login} />
      <Route path="/alerts">
        {() => <ProtectedRoute component={AlertsRoute} />}
      </Route>
      <Route path="/reports">
        {() => <ProtectedRoute component={ReportsRoute} />}
      </Route>
      <Route path="/logs">
        {() => <ProtectedRoute component={LogsRoute} />}
      </Route>
      <Route path="/nodes">
        {() => <ProtectedRoute component={NodesRoute} />}
      </Route>
      <Route path="/">
        {() => <ProtectedRoute component={SidebarLayout} />}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AIProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AIProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
