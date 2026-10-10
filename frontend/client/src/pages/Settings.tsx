import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, RefreshCw, Bell, Shield, Database, Network, User, Globe, Mail, CheckCircle, AlertCircle, Brain, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAI } from "../contexts/AIContext";
import { API_ENDPOINTS, API_BASE_URL } from "../config";

export default function Settings() {
  const [appSettings, setAppSettings] = useState({
    // General Settings
    siteName: "ULPGL Security Console",
    timezone: "UTC+2",
    language: "fr",
    
    // Notification Settings
    emailAlerts: true,
    smsAlerts: false,
    pushNotifications: true,
    alertThreshold: "high",
    
    // Security Settings
    sessionTimeout: 30,
    twoFactorAuth: false,
    ipWhitelist: "",
    
    // Network Settings
    apiEndpoint: API_BASE_URL,
    websocketEndpoint: API_ENDPOINTS.WEBSOCKET.ALERTS as string,
    networkInterface: "eth0",
    
    // Database Settings
    retentionPeriod: 90,
    backupFrequency: "daily",
    maxLogSize: 1000
  });

  const [emailConfig, setEmailConfig] = useState({
    smtpServer: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    smtpSenderEmail: "",
    adminEmail: ""
  });

  const [emailStatus, setEmailStatus] = useState({
    isConfigured: false,
    isLoading: false
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Settings saved successfully");
  };

  const handleReset = () => {
    toast.info("Settings reset to defaults");
  };

  const fetchEmailConfig = async () => {
    setEmailStatus(prev => ({ ...prev, isLoading: true }));
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.EMAIL.CONFIG, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      if (response.ok) {
        const data = await response.json();
        setEmailConfig({
          smtpServer: data.smtp_server || "",
          smtpPort: data.smtp_port || 587,
          smtpUsername: data.smtp_username || "",
          smtpPassword: "",
          smtpSenderEmail: data.smtp_sender_email || "",
          adminEmail: data.admin_email || ""
        });
        setEmailStatus(prev => ({ ...prev, isConfigured: data.is_configured }));
      }
    } catch (error) {
      console.error("Error fetching email config:", error);
    } finally {
      setEmailStatus(prev => ({ ...prev, isLoading: false }));
    }
  };

  const saveEmailConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.EMAIL.CONFIG, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          smtp_server: emailConfig.smtpServer,
          smtp_port: emailConfig.smtpPort,
          smtp_username: emailConfig.smtpUsername,
          smtp_password: emailConfig.smtpPassword,
          smtp_sender_email: emailConfig.smtpSenderEmail,
          admin_email: emailConfig.adminEmail
        })
      });
      if (response.ok) {
        const data = await response.json();
        setEmailStatus(prev => ({ ...prev, isConfigured: data.is_configured }));
        toast.success("Email configuration saved successfully");
      } else {
        toast.error("Failed to save email configuration");
      }
    } catch (error) {
      console.error("Error saving email config:", error);
      toast.error("Error saving email configuration");
    }
  };

  const testEmailConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(API_ENDPOINTS.EMAIL.TEST, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          test_recipient: emailConfig.adminEmail
        })
      });
      if (response.ok) {
        toast.success("Test email sent successfully");
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to send test email");
      }
    } catch (error) {
      console.error("Error testing email config:", error);
      toast.error("Error testing email configuration");
    }
  };

  // Fetch email config on component mount
  useEffect(() => {
    fetchEmailConfig();
  }, []);

  // ===== Agent IA (Intelligence Artificielle) =====
  const { 
    status: aiStatus, 
    aiModeEnabled, 
    rlManualMode, 
    rlManualLearningEnabled, 
    isLoading: aiLoading, 
    isBusy: aiBusy,
    fetchStatus: fetchAIStatus,
    toggleAiMode,
    toggleRlManualMode,
    toggleRlLearning,
    reloadModel,
    testDecision 
  } = useAI();

  const [reloading, setReloading] = useState(false);
  const [testIp, setTestIp] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const handleToggleAiMode = useCallback((v: boolean) => {
    toggleAiMode(v);
  }, [toggleAiMode]);

  const handleToggleRlManual = useCallback((v: boolean) => {
    toggleRlManualMode(v);
  }, [toggleRlManualMode]);

  const handleToggleLearning = useCallback((v: boolean) => {
    toggleRlLearning(v);
  }, [toggleRlLearning]);

  const handleReloadModel = useCallback(async () => {
    setReloading(true);
    try {
      await reloadModel();
      toast.success("Modèle RL rechargé");
    } catch {
      toast.error("Échec du rechargement du modèle");
    } finally {
      setReloading(false);
    }
  }, [reloadModel]);

  const handleTestDecision = useCallback(async () => {
    if (!testIp) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testDecision(testIp);
      if (result) {
        setTestResult(result);
      } else {
        toast.error("Décision impossible");
      }
    } catch {
      toast.error("Backend IA indisponible");
    } finally {
      setTesting(false);
    }
  }, [testIp, testDecision]);

  useEffect(() => {
    fetchAIStatus();
  }, [fetchAIStatus]);

  return (
    <div className="container mx-auto px-4 py-8 font-sans-serif flex flex-col">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-purple-500" />
          <div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
            <p className="text-xs text-zinc-500">Configuration de la plateforme de sécurité</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
            <RefreshCw className="h-4 w-4" /> Reset
          </Button>
          <Button size="sm" className="gap-2" onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
        {/* General Settings */}
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" /> General Settings
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Configuration générale de la plateforme
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Site Name</Label>
              <Input
                value={appSettings.siteName}
                onChange={(e) => setAppSettings({...appSettings, siteName: e.target.value})}
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Timezone</Label>
              <select
                value={appSettings.timezone}
                onChange={(e) => setAppSettings({...appSettings, timezone: e.target.value})}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
              >
                <option value="UTC+0">UTC+0</option>
                <option value="UTC+1">UTC+1</option>
                <option value="UTC+2">UTC+2</option>
                <option value="UTC+3">UTC+3</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Language</Label>
              <select
                value={appSettings.language}
                onChange={(e) => setAppSettings({...appSettings, language: e.target.value})}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Bell className="h-4 w-4 text-yellow-500" /> Notification Settings
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Configuration des alertes et notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-zinc-400">Email Alerts</Label>
                <p className="text-[10px] text-zinc-600">Recevoir les alertes par email</p>
              </div>
              <Switch
                checked={appSettings.emailAlerts}
                onCheckedChange={(checked) => setAppSettings({...appSettings, emailAlerts: checked})}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-zinc-400">SMS Alerts</Label>
                <p className="text-[10px] text-zinc-600">Recevoir les alertes critiques par SMS</p>
              </div>
              <Switch
                checked={appSettings.smsAlerts}
                onCheckedChange={(checked) => setAppSettings({...appSettings, smsAlerts: checked})}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-zinc-400">Push Notifications</Label>
                <p className="text-[10px] text-zinc-600">Notifications push en temps réel</p>
              </div>
              <Switch
                checked={appSettings.pushNotifications}
                onCheckedChange={(checked) => setAppSettings({...appSettings, pushNotifications: checked})}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Alert Threshold</Label>
              <select
                value={appSettings.alertThreshold}
                onChange={(e) => setAppSettings({...appSettings, alertThreshold: e.target.value})}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical Only</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Email Configuration */}
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" /> Email Configuration
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Configuration SMTP pour les alertes par email
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {emailStatus.isConfigured ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-xs text-zinc-400">
                  {emailStatus.isConfigured ? "Email service configured" : "Email service not configured"}
                </span>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={fetchEmailConfig} disabled={emailStatus.isLoading}>
                <RefreshCw className={`h-3 w-3 ${emailStatus.isLoading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">SMTP Server</Label>
              <Input
                value={emailConfig.smtpServer}
                onChange={(e) => setEmailConfig({...emailConfig, smtpServer: e.target.value})}
                placeholder="smtp.gmail.com"
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">SMTP Port</Label>
              <Input
                type="number"
                value={emailConfig.smtpPort}
                onChange={(e) => setEmailConfig({...emailConfig, smtpPort: parseInt(e.target.value)})}
                placeholder="587"
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">SMTP Username</Label>
              <Input
                value={emailConfig.smtpUsername}
                onChange={(e) => setEmailConfig({...emailConfig, smtpUsername: e.target.value})}
                placeholder="your-email@gmail.com"
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">SMTP Password</Label>
              <Input
                type="password"
                value={emailConfig.smtpPassword}
                onChange={(e) => setEmailConfig({...emailConfig, smtpPassword: e.target.value})}
                placeholder="••••••••"
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Sender Email</Label>
              <Input
                type="email"
                value={emailConfig.smtpSenderEmail}
                onChange={(e) => setEmailConfig({...emailConfig, smtpSenderEmail: e.target.value})}
                placeholder="ids-ips@example.com"
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Admin Email</Label>
              <Input
                type="email"
                value={emailConfig.adminEmail}
                onChange={(e) => setEmailConfig({...emailConfig, adminEmail: e.target.value})}
                placeholder="admin@example.com"
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" className="gap-2 flex-1" onClick={saveEmailConfig}>
                <Save className="h-3 w-3" /> Save Config
              </Button>
              <Button variant="outline" size="sm" className="gap-2 flex-1" onClick={testEmailConfig} disabled={!emailStatus.isConfigured}>
                <Mail className="h-3 w-3" /> Test Email
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-500" /> Security Settings
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Configuration de la sécurité et de l'authentification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Session Timeout (minutes)</Label>
              <Input
                type="number"
                value={appSettings.sessionTimeout}
                onChange={(e) => setAppSettings({...appSettings, sessionTimeout: parseInt(e.target.value)})}
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-zinc-400">Two-Factor Authentication</Label>
                <p className="text-[10px] text-zinc-600">Activer la 2FA pour les administrateurs</p>
              </div>
              <Switch
                checked={appSettings.twoFactorAuth}
                onCheckedChange={(checked) => setAppSettings({...appSettings, twoFactorAuth: checked})}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">IP Whititelist (comma separated)</Label>
              <Input
                placeholder="192.168.1.0/24, 10.0.0.0/8"
                value={appSettings.ipWhitelist}
                onChange={(e) => setAppSettings({...appSettings, ipWhitelist: e.target.value})}
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Network Settings */}
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Network className="h-4 w-4 text-cyan-500" /> Network Settings
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Configuration des endpoints réseau
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">API Endpoint</Label>
              <Input
                value={appSettings.apiEndpoint}
                onChange={(e) => setAppSettings({...appSettings, apiEndpoint: e.target.value})}
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">WebSocket Endpoint</Label>
              <Input
                value={appSettings.websocketEndpoint}
                onChange={(e) => setAppSettings({...appSettings, websocketEndpoint: e.target.value})}
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Network Interface</Label>
              <Input
                value={appSettings.networkInterface}
                onChange={(e) => setAppSettings({...appSettings, networkInterface: e.target.value})}
                className="bg-zinc-900 border-zinc-800 text-white text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Database Settings */}
        <Card className="bg-zinc-950/40 border-zinc-900 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Database className="h-4 w-4 text-orange-500" /> Database Settings
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Configuration de la base de données et de la rétention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Retention Period (days)</Label>
                <Input
                  type="number"
                  value={appSettings.retentionPeriod}
                  onChange={(e) => setAppSettings({...appSettings, retentionPeriod: parseInt(e.target.value)})}
                  className="bg-zinc-900 border-zinc-800 text-white text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Backup Frequency</Label>
                <select
                  value={appSettings.backupFrequency}
                  onChange={(e) => setAppSettings({...appSettings, backupFrequency: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Max Log Size (MB)</Label>
                <Input
                  type="number"
                  value={appSettings.maxLogSize}
                  onChange={(e) => setAppSettings({...appSettings, maxLogSize: parseInt(e.target.value)})}
                  className="bg-zinc-900 border-zinc-800 text-white text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent IA — Intelligence Artificielle */}
        <Card className="bg-zinc-950/40 border-zinc-900">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-400" /> Agent IA (Intelligence Artificielle)
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Pilotage du moteur de décision RL et du mode d'intervention automatique
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[11px]">
              <span className="text-zinc-400">Modèle RL</span>
              <span className={aiStatus?.is_trained ? "text-emerald-400" : "text-amber-400"}>
                {aiStatus?.is_trained ? `Chargé (${aiStatus?.model_version ?? "?"})` : "Non entraîné — fallback manuel"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-zinc-400">Mode Agent IA</Label>
                <p className="text-[10px] text-zinc-600">Active les décisions automatiques du modèle RL</p>
              </div>
              <Switch checked={aiModeEnabled} onCheckedChange={handleToggleAiMode} disabled={aiLoading || aiBusy} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-zinc-400">Mode manuel RL</Label>
                <p className="text-[10px] text-zinc-600">Délègue l'action finale à un opérateur humain</p>
              </div>
              <Switch checked={rlManualMode} onCheckedChange={handleToggleRlManual} disabled={aiLoading || aiBusy} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-zinc-400">Apprentissage en mode manuel</Label>
                <p className="text-[10px] text-zinc-600">Enregistre le feedback pour ré-entraîner le modèle</p>
              </div>
              <Switch checked={rlManualLearningEnabled} onCheckedChange={handleToggleLearning} disabled={aiLoading || aiBusy} />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleReloadModel} disabled={reloading}>
                <RefreshCw className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} /> Recharger le modèle
              </Button>
            </div>

            <div className="space-y-2 border-t border-zinc-800 pt-3">
              <Label className="text-xs text-zinc-400">Tester une décision</Label>
              <div className="flex gap-2">
                <Input
                  value={testIp}
                  onChange={(e) => setTestIp(e.target.value)}
                  placeholder="192.168.1.50"
                  className="bg-zinc-900 border-zinc-800 text-white text-sm"
                />
                <Button size="sm" className="gap-2" onClick={handleTestDecision} disabled={testing || !testIp}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Tester
                </Button>
              </div>
              {testResult && (
                <div className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[11px] font-mono">
                  <div className="flex justify-between"><span className="text-zinc-400">Action</span><span className="text-white uppercase">{testResult.action}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Confiance</span><span className="text-white">{Number(testResult.confidence * 100).toFixed(1)}%</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Raison</span><span className="text-zinc-500">{testResult.reason}</span></div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
