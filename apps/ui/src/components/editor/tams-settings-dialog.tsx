import { useState, useCallback, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

import { TamsClient, TamsClientError, type TamsConfig } from "../../lib/tams-client";
import { useTamsSettingsStore } from "../../state/tams-settings-store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface TamsSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TamsSettingsDialog({ open, onOpenChange }: TamsSettingsDialogProps) {
  const tamsConfig = useTamsSettingsStore((s) => s.tamsConfig);
  const setTamsConfig = useTamsSettingsStore((s) => s.setTamsConfig);
  const setConnected = useTamsSettingsStore((s) => s.setConnected);
  const setConnectionError = useTamsSettingsStore((s) => s.setConnectionError);

  const [endpoint, setEndpoint] = useState("");
  const [authType, setAuthType] = useState<TamsConfig["authType"]>("bearer");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (open && tamsConfig) {
      setEndpoint(tamsConfig.endpoint);
      setAuthType(tamsConfig.authType);
      setToken(tamsConfig.token ?? "");
      setUsername(tamsConfig.username ?? "");
      setPassword(tamsConfig.password ?? "");
      setTestResult(null);
    } else if (open) {
      setEndpoint("");
      setAuthType("bearer");
      setToken("");
      setUsername("");
      setPassword("");
      setTestResult(null);
    }
  }, [open, tamsConfig]);

  const buildConfig = useCallback((): TamsConfig => {
    return {
      endpoint: endpoint.trim(),
      authType,
      token: token.trim() || undefined,
      username: username.trim() || undefined,
      password: password.trim() || undefined,
    };
  }, [endpoint, authType, token, username, password]);

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const config = buildConfig();
      const client = new TamsClient(config);
      const info = await client.getServiceInfo();
      setTestResult({
        success: true,
        message: `Connected: ${info.name ?? "TAMS"} (API v${info.api_version})`,
      });
    } catch (error) {
      const message =
        error instanceof TamsClientError
          ? `Error ${error.status}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Connection failed";
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  }, [buildConfig]);

  const handleSave = useCallback(() => {
    const config = buildConfig();
    if (!config.endpoint) {
      setTestResult({ success: false, message: "Endpoint URL is required" });
      return;
    }
    setTamsConfig(config);
    if (testResult?.success) {
      setConnected(true);
      setConnectionError(null);
    }
    onOpenChange(false);
  }, [buildConfig, testResult, setTamsConfig, setConnected, setConnectionError, onOpenChange]);

  const handleDisconnect = useCallback(() => {
    setTamsConfig(null);
    setConnected(false);
    setConnectionError(null);
    setEndpoint("");
    setToken("");
    setUsername("");
    setPassword("");
    setTestResult(null);
  }, [setTamsConfig, setConnected, setConnectionError]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>TAMS Connection</DialogTitle>
          <DialogDescription>
            Configure the Time-addressable Media Store endpoint and credentials.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          {/* Endpoint URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Endpoint URL</label>
            <Input
              placeholder="https://example.com/tams/v8.0"
              value={endpoint}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndpoint(e.target.value)}
            />
          </div>

          {/* Auth Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Authentication</label>
            <Select value={authType} onValueChange={(v) => setAuthType(v as TamsConfig["authType"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="url_token">URL Token</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Credential fields based on auth type */}
          {authType === "bearer" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Bearer Token</label>
              <Input
                type="password"
                placeholder="Enter token"
                value={token}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
              />
            </div>
          )}

          {authType === "url_token" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Access Token</label>
              <Input
                type="password"
                placeholder="Enter access token"
                value={token}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
              />
            </div>
          )}

          {authType === "basic" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Username</label>
                <Input
                  placeholder="Username"
                  value={username}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Test result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-md p-2 text-xs ${
                testResult.success
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="size-3.5 shrink-0" />
              ) : (
                <XCircle className="size-3.5 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </DialogPanel>

        <DialogFooter className="flex-row gap-2">
          {tamsConfig && (
            <Button variant="destructive" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleTestConnection()}
            disabled={!endpoint.trim() || isTesting}
          >
            {isTesting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Test Connection
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!endpoint.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
