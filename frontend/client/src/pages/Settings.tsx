import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings as SettingsIcon,
  Save,
  RefreshCw,
  Bell,
  Shield,
  Database,
  Network,
  User,
  Globe,
  SunMoon,
  Mail,
  CheckCircle,
  AlertCircle,
  Brain,
  Zap,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAI } from "../contexts/AIContext";
import {
  COLOR_THEMES,
  DEFAULT_COLOR_THEME,
  useTheme,
  type ColorTheme,
} from "@/contexts/ThemeContext";
import { API_ENDPOINTS, API_BASE_URL } from "../config";

const SETTINGS_STORAGE_KEY = "seeyou-settings";

const DEFAULT_APP_SETTINGS = {
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
  maxLogSize: 1000,
};

export default function Settings() {
  const { theme, colorTheme, setColorTheme } = useTheme();
  // Choix de thème en brouillon : appliqué seulement à la confirmation « Enregistrer ».
  const [draftColorTheme, setDraftColorTheme] =
    useState<ColorTheme>(colorTheme);
  const [appSettings, setAppSettings] = useState(() => {
    try {
      const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Stockage indisponible : valeurs par défaut.
    }
    return DEFAULT_APP_SETTINGS;
  });
  const [pendingAction, setPendingAction] = useState<"save" | "reset" | null>(
    null,
  );

  const [emailConfig, setEmailConfig] = useState({
    smtpServer: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    smtpSenderEmail: "",
    adminEmail: "",
  });

  const [emailStatus, setEmailStatus] = useState({
    isConfigured: false,
    isLoading: false,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      setColorTheme(draftColorTheme);
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(appSettings),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      toast.success("Paramètres enregistrés");
      setPendingAction(null);
    } catch {
      toast.error("Impossible d'enregistrer les paramètres.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setAppSettings({ ...DEFAULT_APP_SETTINGS });
    try {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Stockage indisponible : la réinitialisation reste en mémoire.
    }
    setDraftColorTheme(DEFAULT_COLOR_THEME);
    setColorTheme(DEFAULT_COLOR_THEME);
    toast.success("Paramètres réinitialisés aux valeurs par défaut");
    setPendingAction(null);
  };

  const fetchEmailConfig = async () => {
    setEmailStatus((prev) => ({ ...prev, isLoading: true }));
    try {
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(API_ENDPOINTS.EMAIL.CONFIG, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setEmailConfig({
          smtpServer: data.smtp_server || "",
          smtpPort: data.smtp_port || 587,
          smtpUsername: data.smtp_username || "",
          smtpPassword: "",
          smtpSenderEmail: data.smtp_sender_email || "",
          adminEmail: data.admin_email || "",
        });
        setEmailStatus((prev) => ({
          ...prev,
          isConfigured: data.is_configured,
        }));
      }
    } catch (error) {
      console.error("Error fetching email config:", error);
    } finally {
      setEmailStatus((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const saveEmailConfig = async () => {
    try {
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(API_ENDPOINTS.EMAIL.CONFIG, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          smtp_server: emailConfig.smtpServer,
          smtp_port: emailConfig.smtpPort,
          smtp_username: emailConfig.smtpUsername,
          smtp_password: emailConfig.smtpPassword,
          smtp_sender_email: emailConfig.smtpSenderEmail,
          admin_email: emailConfig.adminEmail,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setEmailStatus((prev) => ({
          ...prev,
          isConfigured: data.is_configured,
        }));
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
      const token = localStorage.getItem("jwt_token");
      const response = await fetch(API_ENDPOINTS.EMAIL.TEST, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          test_recipient: emailConfig.adminEmail,
        }),
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
    testDecision,
  } = useAI();

  const [reloading, setReloading] = useState(false);
  const [testIp, setTestIp] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const handleToggleAiMode = useCallback(
    (v: boolean) => {
      toggleAiMode(v);
    },
    [toggleAiMode],
  );

  const handleToggleRlManual = useCallback(
    (v: boolean) => {
      toggleRlManualMode(v);
    },
    [toggleRlManualMode],
  );

  const handleToggleLearning = useCallback(
    (v: boolean) => {
      toggleRlLearning(v);
    },
    [toggleRlLearning],
  );

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
    <div className="container mx-auto px-4 py-8 font-ui flex flex-col">
      <div className="flex flex-col gap-4 mb-6 shrink-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-foreground" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground">
              Configuration de la plateforme de sécurité
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setPendingAction("reset")}
          >
            <RefreshCw className="h-4 w-4" /> Reset
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setPendingAction("save")}
            disabled={isSaving}
          >
            <Save className="h-4 w-4" />{" "}
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
          {/* Apparence */}
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <SunMoon className="h-4 w-4 text-foreground" /> Apparence
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Le thème choisi s'applique après confirmation de « Save Changes
                ».
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="color-theme"
                  className="text-xs text-muted-foreground"
                >
                  Thème de couleurs
                </Label>
                <select
                  id="color-theme"
                  value={draftColorTheme}
                  onChange={(event) =>
                    setDraftColorTheme(event.target.value as ColorTheme)
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
                >
                  {COLOR_THEMES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {item.id === "theme-5" ? " [Défaut]" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Mode actuel : {theme === "dark" ? "Sombre" : "Clair"}. Utilise
                le bouton soleil/lune dans la barre supérieure pour changer de
                mode.
              </p>
            </CardContent>
          </Card>

          {/* General Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Globe className="h-4 w-4 text-foreground" /> General Settings
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configuration générale de la plateforme
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Site Name
                </Label>
                <Input
                  value={appSettings.siteName}
                  onChange={(e) =>
                    setAppSettings({ ...appSettings, siteName: e.target.value })
                  }
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Timezone
                </Label>
                <select
                  value={appSettings.timezone}
                  onChange={(e) =>
                    setAppSettings({ ...appSettings, timezone: e.target.value })
                  }
                  className="w-full bg-card border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
                >
                  <option value="UTC+0">UTC+0</option>
                  <option value="UTC+1">UTC+1</option>
                  <option value="UTC+2">UTC+2</option>
                  <option value="UTC+3">UTC+3</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Language
                </Label>
                <select
                  value={appSettings.language}
                  onChange={(e) =>
                    setAppSettings({ ...appSettings, language: e.target.value })
                  }
                  className="w-full bg-card border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Bell className="h-4 w-4 text-foreground" /> Notification
                Settings
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configuration des alertes et notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Email Alerts
                  </Label>
                  <p className="text-[10px] text-muted-foreground opacity-80">
                    Recevoir les alertes par email
                  </p>
                </div>
                <Switch
                  checked={appSettings.emailAlerts}
                  onCheckedChange={(checked) =>
                    setAppSettings({ ...appSettings, emailAlerts: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    SMS Alerts
                  </Label>
                  <p className="text-[10px] text-muted-foreground opacity-80">
                    Recevoir les alertes critiques par SMS
                  </p>
                </div>
                <Switch
                  checked={appSettings.smsAlerts}
                  onCheckedChange={(checked) =>
                    setAppSettings({ ...appSettings, smsAlerts: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Push Notifications
                  </Label>
                  <p className="text-[10px] text-muted-foreground opacity-80">
                    Notifications push en temps réel
                  </p>
                </div>
                <Switch
                  checked={appSettings.pushNotifications}
                  onCheckedChange={(checked) =>
                    setAppSettings({
                      ...appSettings,
                      pushNotifications: checked,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Alert Threshold
                </Label>
                <select
                  value={appSettings.alertThreshold}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      alertThreshold: e.target.value,
                    })
                  }
                  className="w-full bg-card border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
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
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Mail className="h-4 w-4 text-foreground" /> Email Configuration
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configuration SMTP pour les alertes par email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {emailStatus.isConfigured ? (
                    <CheckCircle className="h-4 w-4 text-foreground" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {emailStatus.isConfigured
                      ? "Email service configured"
                      : "Email service not configured"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={fetchEmailConfig}
                  disabled={emailStatus.isLoading}
                >
                  <RefreshCw
                    className={`h-3 w-3 ${emailStatus.isLoading ? "animate-spin motion-reduce:animate-none" : ""}`}
                  />{" "}
                  Refresh
                </Button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  SMTP Server
                </Label>
                <Input
                  value={emailConfig.smtpServer}
                  onChange={(e) =>
                    setEmailConfig({
                      ...emailConfig,
                      smtpServer: e.target.value,
                    })
                  }
                  placeholder="smtp.gmail.com"
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  SMTP Port
                </Label>
                <Input
                  type="number"
                  value={emailConfig.smtpPort}
                  onChange={(e) =>
                    setEmailConfig({
                      ...emailConfig,
                      smtpPort: parseInt(e.target.value),
                    })
                  }
                  placeholder="587"
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  SMTP Username
                </Label>
                <Input
                  value={emailConfig.smtpUsername}
                  onChange={(e) =>
                    setEmailConfig({
                      ...emailConfig,
                      smtpUsername: e.target.value,
                    })
                  }
                  placeholder="your-email@gmail.com"
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  SMTP Password
                </Label>
                <PasswordInput
                  value={emailConfig.smtpPassword}
                  onChange={(e) =>
                    setEmailConfig({
                      ...emailConfig,
                      smtpPassword: e.target.value,
                    })
                  }
                  placeholder="••••••••"
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Sender Email
                </Label>
                <Input
                  type="email"
                  value={emailConfig.smtpSenderEmail}
                  onChange={(e) =>
                    setEmailConfig({
                      ...emailConfig,
                      smtpSenderEmail: e.target.value,
                    })
                  }
                  placeholder="ids-ips@example.com"
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Admin Email
                </Label>
                <Input
                  type="email"
                  value={emailConfig.adminEmail}
                  onChange={(e) =>
                    setEmailConfig({
                      ...emailConfig,
                      adminEmail: e.target.value,
                    })
                  }
                  placeholder="admin@example.com"
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  className="gap-2 flex-1"
                  onClick={saveEmailConfig}
                >
                  <Save className="h-3 w-3" /> Save Config
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 flex-1"
                  onClick={testEmailConfig}
                  disabled={!emailStatus.isConfigured}
                >
                  <Mail className="h-3 w-3" /> Test Email
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-foreground" /> Security Settings
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configuration de la sécurité et de l'authentification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Session Timeout (minutes)
                </Label>
                <Input
                  type="number"
                  value={appSettings.sessionTimeout}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      sessionTimeout: parseInt(e.target.value),
                    })
                  }
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Two-Factor Authentication
                  </Label>
                  <p className="text-[10px] text-muted-foreground opacity-80">
                    Activer la 2FA pour les administrateurs
                  </p>
                </div>
                <Switch
                  checked={appSettings.twoFactorAuth}
                  onCheckedChange={(checked) =>
                    setAppSettings({ ...appSettings, twoFactorAuth: checked })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  IP Whititelist (comma separated)
                </Label>
                <Input
                  placeholder="192.168.1.0/24, 10.0.0.0/8"
                  value={appSettings.ipWhitelist}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      ipWhitelist: e.target.value,
                    })
                  }
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Network Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Network className="h-4 w-4 text-foreground" /> Network Settings
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configuration des endpoints réseau
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  API Endpoint
                </Label>
                <Input
                  value={appSettings.apiEndpoint}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      apiEndpoint: e.target.value,
                    })
                  }
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  WebSocket Endpoint
                </Label>
                <Input
                  value={appSettings.websocketEndpoint}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      websocketEndpoint: e.target.value,
                    })
                  }
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Network Interface
                </Label>
                <Input
                  value={appSettings.networkInterface}
                  onChange={(e) =>
                    setAppSettings({
                      ...appSettings,
                      networkInterface: e.target.value,
                    })
                  }
                  className="bg-card border-input text-foreground text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Database Settings */}
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Database className="h-4 w-4 text-foreground" /> Database
                Settings
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configuration de la base de données et de la rétention
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Retention Period (days)
                  </Label>
                  <Input
                    type="number"
                    value={appSettings.retentionPeriod}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        retentionPeriod: parseInt(e.target.value),
                      })
                    }
                    className="bg-card border-input text-foreground text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Backup Frequency
                  </Label>
                  <select
                    value={appSettings.backupFrequency}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        backupFrequency: e.target.value,
                      })
                    }
                    className="w-full bg-card border border-input rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Max Log Size (MB)
                  </Label>
                  <Input
                    type="number"
                    value={appSettings.maxLogSize}
                    onChange={(e) =>
                      setAppSettings({
                        ...appSettings,
                        maxLogSize: parseInt(e.target.value),
                      })
                    }
                    className="bg-card border-input text-foreground text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Agent IA — Intelligence Artificielle */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Brain className="h-4 w-4 text-foreground" /> Agent IA
                (Intelligence Artificielle)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Pilotage du moteur de décision RL et du mode d'intervention
                automatique
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2 text-[11px]">
                <span className="text-muted-foreground">Modèle RL</span>
                <span
                  className={
                    aiStatus?.is_trained ? "text-foreground" : "text-foreground"
                  }
                >
                  {aiStatus?.is_trained
                    ? `Chargé (${aiStatus?.model_version ?? "?"})`
                    : "Non entraîné — fallback manuel"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Mode Agent IA
                  </Label>
                  <p className="text-[10px] text-muted-foreground opacity-80">
                    Active les décisions automatiques du modèle RL
                  </p>
                </div>
                <Switch
                  checked={aiModeEnabled}
                  onCheckedChange={handleToggleAiMode}
                  disabled={aiLoading || aiBusy}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Mode manuel RL
                  </Label>
                  <p className="text-[10px] text-muted-foreground opacity-80">
                    Délègue l'action finale à un opérateur humain
                  </p>
                </div>
                <Switch
                  checked={rlManualMode}
                  onCheckedChange={handleToggleRlManual}
                  disabled={aiLoading || aiBusy}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Apprentissage en mode manuel
                  </Label>
                  <p className="text-[10px] text-muted-foreground opacity-80">
                    Enregistre le feedback pour ré-entraîner le modèle
                  </p>
                </div>
                <Switch
                  checked={rlManualLearningEnabled}
                  onCheckedChange={handleToggleLearning}
                  disabled={aiLoading || aiBusy}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleReloadModel}
                  disabled={reloading}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${reloading ? "animate-spin motion-reduce:animate-none" : ""}`}
                  />{" "}
                  Recharger le modèle
                </Button>
              </div>

              <div className="space-y-2 border-t border-input pt-3">
                <Label className="text-xs text-muted-foreground">
                  Tester une décision
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={testIp}
                    onChange={(e) => setTestIp(e.target.value)}
                    placeholder="192.168.1.50"
                    className="bg-card border-input text-foreground text-sm"
                  />
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={handleTestDecision}
                    disabled={testing || !testIp}
                  >
                    {testing ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}{" "}
                    Tester
                  </Button>
                </div>
                {testResult && (
                  <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Action</span>
                      <span className="text-foreground uppercase">
                        {testResult.action}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Confiance</span>
                      <span className="text-foreground">
                        {Number(testResult.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Raison</span>
                      <span className="text-muted-foreground">
                        {testResult.reason}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            // Annulation : le thème affiché revient au thème réellement actif.
            setDraftColorTheme(colorTheme);
            setPendingAction(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === "save"
                ? "Enregistrer les paramètres ?"
                : "Réinitialiser les paramètres ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "save"
                ? "Les modifications, dont le thème de couleurs, seront appliquées et mémorisées sur cet appareil."
                : "Tous les paramètres du site reviendront aux valeurs par défaut. Le thème de couleurs sera réinitialisé sur Thème Minimaliste."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                if (pendingAction === "save") void handleSave();
                else if (pendingAction === "reset") handleReset();
              }}
            >
              {pendingAction === "save"
                ? isSaving
                  ? "Enregistrement..."
                  : "Enregistrer"
                : "Réinitialiser"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
