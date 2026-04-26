/**
 * TAMS (Time-addressable Media Store) API client.
 * Based on the TAMS OpenAPI spec v8.0.
 */

export interface TamsConfig {
  endpoint: string;
  authType: "bearer" | "basic" | "url_token";
  /** Bearer token or URL token */
  token?: string;
  /** Basic auth username */
  username?: string;
  /** Basic auth password */
  password?: string;
}

export interface TamsSource {
  id: string;
  format: string;
  label?: string;
  description?: string;
  tags?: Record<string, string | string[]>;
}

export interface TamsFlow {
  id: string;
  source_id: string;
  format?: string;
  codec?: string;
  label?: string;
  description?: string;
  container?: string;
  frame_width?: number;
  frame_height?: number;
  tags?: Record<string, string | string[]>;
}

export interface TamsFlowSegment {
  object_id: string;
  timerange: string;
  ts_offset?: string;
  key_frame_count?: number;
  get_urls?: TamsGetUrl[];
}

export interface TamsGetUrl {
  url: string;
  label?: string;
  content_type?: string;
}

export interface TamsServiceInfo {
  name?: string;
  description?: string;
  type: string;
  api_version: string;
  service_version?: string;
  min_object_timeout: string;
}

export class TamsClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "TamsClientError";
  }
}

export class TamsClient {
  private config: TamsConfig;

  constructor(config: TamsConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return this.config.endpoint.replace(/\/$/, "");
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      Accept: "application/json",
    };

    switch (this.config.authType) {
      case "bearer":
        if (this.config.token) {
          headers["Authorization"] = `Bearer ${this.config.token}`;
        }
        break;
      case "basic":
        if (this.config.username && this.config.password) {
          const encoded = btoa(`${this.config.username}:${this.config.password}`);
          headers["Authorization"] = `Basic ${encoded}`;
        }
        break;
      // url_token is handled via query param
    }

    return headers;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (this.config.authType === "url_token" && this.config.token) {
      url.searchParams.set("access_token", this.config.token);
    }
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    const response = await fetch(url, {
      headers: this.getHeaders(),
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new TamsClientError(response.status, `TAMS API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /** Test connection and retrieve service info */
  async getServiceInfo(): Promise<TamsServiceInfo> {
    return this.request<TamsServiceInfo>("/service");
  }

  /** List all sources */
  async listSources(params?: { label?: string; format?: string; limit?: number }): Promise<TamsSource[]> {
    const queryParams: Record<string, string> = {};
    if (params?.label) queryParams["label"] = params.label;
    if (params?.format) queryParams["format"] = params.format;
    if (params?.limit) queryParams["limit"] = String(params.limit);
    return this.request<TamsSource[]>("/sources", queryParams);
  }

  /** Get a specific source */
  async getSource(sourceId: string): Promise<TamsSource> {
    return this.request<TamsSource>(`/sources/${encodeURIComponent(sourceId)}`);
  }

  /** List all flows */
  async listFlows(params?: {
    source_id?: string;
    format?: string;
    codec?: string;
    label?: string;
    limit?: number;
  }): Promise<TamsFlow[]> {
    const queryParams: Record<string, string> = {};
    if (params?.source_id) queryParams["source_id"] = params.source_id;
    if (params?.format) queryParams["format"] = params.format;
    if (params?.codec) queryParams["codec"] = params.codec;
    if (params?.label) queryParams["label"] = params.label;
    if (params?.limit) queryParams["limit"] = String(params.limit);
    return this.request<TamsFlow[]>("/flows", queryParams);
  }

  /** Get a specific flow */
  async getFlow(flowId: string): Promise<TamsFlow> {
    return this.request<TamsFlow>(`/flows/${encodeURIComponent(flowId)}`);
  }

  /** List segments for a flow */
  async listFlowSegments(
    flowId: string,
    params?: { timerange?: string; limit?: number; reverse_order?: boolean },
  ): Promise<TamsFlowSegment[]> {
    const queryParams: Record<string, string> = {};
    if (params?.timerange) queryParams["timerange"] = params.timerange;
    if (params?.limit) queryParams["limit"] = String(params.limit);
    if (params?.reverse_order) queryParams["reverse_order"] = "true";
    return this.request<TamsFlowSegment[]>(
      `/flows/${encodeURIComponent(flowId)}/segments`,
      queryParams,
    );
  }

  /** Get download URL for a flow segment's media object */
  getSegmentDownloadUrl(segment: TamsFlowSegment): string | null {
    if (!segment.get_urls || segment.get_urls.length === 0) return null;
    return segment.get_urls[0].url;
  }
}
