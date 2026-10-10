import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Shield, Clock, Edit, Save, Key, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "../config";

export default function UserProfile() {
  const { token, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState({
    username: "admin",
    email: "admin@ulpgl.ac.cd",
    role: "Administrator",
    department: "Security Operations Center",
    lastLogin: new Date().toLocaleString('fr-FR'),
    accountCreated: "2024-01-15"
  });

  const loadProfile = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.AUTH.ME, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const u = await res.json();
        setProfileData((prev) => ({
          ...prev,
          username: u.username,
          email: u.email,
          role: u.role === "admin" ? "Administrator" : u.role,
          accountCreated: u.accountCreated ?? prev.accountCreated,
        }));
      } else {
        toast.error("Session expirée — affichage du profil local.");
      }
    } catch {
      toast.error("Backend Identity Monitoring indisponible — profil local.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSave = () => {
    setIsEditing(false);
    toast.success("Profil mis à jour localement");
  };

  const handleLogout = () => {
    logout();
    toast.info("Vous avez été déconnecté");
  };

  return (
    <div className="container mx-auto px-4 py-8 font-sans-serif flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <User className="h-6 w-6 text-emerald-500" />
          <div>
            <h1 className="text-xl font-bold text-white">User Profile</h1>
            <p className="text-xs text-zinc-500">Gestion du compte utilisateur</p>
          </div>
        </div>
        <div className="flex gap-2">
          {loading && (
            <span className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-6">
        {/* Profile Card */}
        <Card className="bg-zinc-950/40 border-zinc-900 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-500" /> Profile Information
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Informations personnelles du compte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center py-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                <User className="h-12 w-12 text-white" />
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="text-[10px] text-zinc-500">Username</p>
                  <p className="text-sm text-white font-medium">{profileData.username}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="text-[10px] text-zinc-500">Email</p>
                  <p className="text-sm text-white font-medium">{profileData.email}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="text-[10px] text-zinc-500">Role</p>
                  <p className="text-sm text-emerald-500 font-medium">{profileData.role}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="text-[10px] text-zinc-500">Department</p>
                  <p className="text-sm text-white font-medium">{profileData.department}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Details Card */}
        <Card className="bg-zinc-950/40 border-zinc-900 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" /> Account Details
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Détails et sécurité du compte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Account Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-cyan-500" />
                  <p className="text-[10px] text-zinc-500">Last Login</p>
                </div>
                <p className="text-sm text-white font-medium">{profileData.lastLogin}</p>
              </div>
              
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-purple-500" />
                  <p className="text-[10px] text-zinc-500">Account Created</p>
                </div>
                <p className="text-sm text-white font-medium">{profileData.accountCreated}</p>
              </div>
              
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  <p className="text-[10px] text-zinc-500">Account Status</p>
                </div>
                <p className="text-sm text-emerald-500 font-medium">Active</p>
              </div>
            </div>

            {/* Edit Profile Form */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Edit Profile</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  <Edit className="h-4 w-4" /> {isEditing ? "Cancel" : "Edit"}
                </Button>
              </div>

              {isEditing && (
                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400">Username</Label>
                      <Input
                        value={profileData.username}
                        onChange={(e) => setProfileData({...profileData, username: e.target.value})}
                        className="bg-zinc-900 border-zinc-800 text-white text-sm"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400">Email</Label>
                      <Input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                        className="bg-zinc-900 border-zinc-800 text-white text-sm"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400">Department</Label>
                      <Input
                        value={profileData.department}
                        onChange={(e) => setProfileData({...profileData, department: e.target.value})}
                        className="bg-zinc-900 border-zinc-800 text-white text-sm"
                      />
                    </div>
                  </div>
                  
                  <Button size="sm" className="gap-2" onClick={handleSave}>
                    <Save className="h-4 w-4" /> Save Changes
                  </Button>
                </div>
              )}
            </div>

            {/* Security Settings */}
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <h3 className="text-sm font-medium text-white">Security</h3>
              <div className="space-y-3">
                <Button variant="outline" size="sm" className="gap-2 w-full justify-start">
                  <Key className="h-4 w-4" /> Change Password
                </Button>
                <Button variant="outline" size="sm" className="gap-2 w-full justify-start">
                  <Shield className="h-4 w-4" /> Enable 2FA
                </Button>
                <Button variant="outline" size="sm" className="gap-2 w-full justify-start">
                  <User className="h-4 w-4" /> View Login History
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
