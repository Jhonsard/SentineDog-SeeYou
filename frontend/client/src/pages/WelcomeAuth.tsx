import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, User, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "@/config";

export default function WelcomeAuth() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    email: ""
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (!isLogin) {
      if (!formData.email.trim()) {
        newErrors.email = "Email is required";
      } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
        newErrors.email = "Invalid email format";
      }

      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        // Mode connexion - utilise form data (OAuth2)
        const formDataEncoded = new URLSearchParams();
        formDataEncoded.append("username", formData.username);
        formDataEncoded.append("password", formData.password);

        const response = await fetch(API_ENDPOINTS.AUTH.TOKEN, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formDataEncoded.toString(),
        });

        if (response.ok) {
          const data = await response.json();
          login(data.access_token);
          toast.success("Welcome back! You are now connected.");
          setLocation("/");
        } else {
          const errorData = await response.json();
          toast.error(errorData.detail || "Authentication failed");
        }
      } else {
        // Mode inscription - utilise JSON
        const response = await fetch(API_ENDPOINTS.AUTH.REGISTER, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            role: "user"
          }),
        });

        if (response.ok) {
          const data = await response.json();
          toast.success("Account created successfully! Please sign in.");
          setIsLogin(true);
          setFormData({
            username: "",
            password: "",
            confirmPassword: "",
            email: ""
          });
          setErrors({});
        } else {
          const errorData = await response.json();
          toast.error(errorData.detail || "Registration failed");
        }
      }
    } catch (error) {
      toast.error("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error for this field
    if (errors[e.target.name]) {
      setErrors({
        ...errors,
        [e.target.name]: ""
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#090b0f] flex items-center justify-center p-4 font-sans-serif">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-black">
              <img src="/Seeyou.webp" alt="SeeYou" className="h-full w-full object-cover" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">SeeYou</h1>
          <p className="text-sm text-zinc-500">
            {isLogin ? "Sign in to access the security dashboard" : "Create your account to get started"}
          </p>
        </div>

        {/* Auth Card */}
        <Card className="bg-[#0c0e12] border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#4d8eff]" />
              {isLogin ? "Authentication" : "Create Account"}
            </CardTitle>
            <CardDescription className="text-zinc-500">
              {isLogin 
                ? "Enter your credentials to access the system" 
                : "Fill in your information to create an account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-zinc-400 text-xs">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    value={formData.username}
                    onChange={handleInputChange}
                    className={`bg-zinc-900 border-zinc-900 text-white pl-10 ${errors.username ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.username && (
                  <p className="text-red-500 text-xs flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {errors.username}
                  </p>
                )}
              </div>

              {/* Email (only for registration) */}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-zinc-400 text-xs">Email</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className={`bg-zinc-900 border-zinc-900 text-white pl-10 ${errors.email ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-red-500 text-xs flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {errors.email}
                    </p>
                  )}
                </div>
              )}

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-400 text-xs">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`bg-zinc-900 border-zinc-900 text-white pl-10 ${errors.password ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.password && (
                  <p className="text-red-500 text-xs flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {errors.password}
                  </p>
                )}
              </div>

              {/* Confirm Password (only for registration) */}
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-zinc-400 text-xs">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className={`bg-zinc-900 border-zinc-900 text-white pl-10 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-red-500 text-xs flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {errors.confirmPassword}
                    </p>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full bg-[#4d8eff] hover:bg-[#3b82f6] text-white gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  "Processing..."
                ) : (
                  <>
                    {isLogin ? "Sign In" : "Create Account"}
                  </>
                )}
              </Button>

              {/* Toggle between Login/Register */}
              <div className="text-center pt-4 border-t border-zinc-800">
                <p className="text-zinc-500 text-sm">
                  {isLogin ? "Don't have an account?" : "Already have an account?"}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setErrors({});
                      setFormData({
                        username: "",
                        password: "",
                        confirmPassword: "",
                        email: ""
                      });
                    }}
                    className="text-[#4d8eff] hover:text-[#3b82f6] ml-2 font-medium"
                  >
                    {isLogin ? "Sign up" : "Sign in"}
                  </button>
                </p>
              </div>
            </form>

            {/* Security Notice */}
            <div className="mt-6 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-500">
                  <p className="font-medium text-zinc-400 mb-1">Security Notice</p>
                  <p>For security reasons, you will be automatically logged out after 1 hour of inactivity.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-zinc-600">
          <p>© 2024 SeeYou SOC</p>
        </div>
      </div>
    </div>
  );
}
