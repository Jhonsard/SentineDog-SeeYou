import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import WelcomeAuth from "@/pages/WelcomeAuth";
import LogsManagement from "@/pages/LogsManagement";
import NodesManagement from "@/pages/NodesManagement";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AIProvider } from "./contexts/AIContext";
import { SidebarLayout } from "./components/SidebarLayout"; 

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Component /> : <Redirect to="/welcome" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/welcome" component={WelcomeAuth} />
      <Route path="/login" component={Login} />
      <Route path="/logs">
        {() => <ProtectedRoute component={LogsManagement} />}
      </Route>
      <Route path="/nodes">
        {() => <ProtectedRoute component={NodesManagement} />}
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
      <ThemeProvider defaultTheme="dark">
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
