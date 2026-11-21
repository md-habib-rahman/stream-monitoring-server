const axios = require("axios");
const {
  SUPPORTED_MODS,
  inspectDvbStatXml,
  parseDvbStatXml,
} = require("./dvbstatParser");

const SUPPORTED_MOD_SET = new Set(SUPPORTED_MODS);
const LOGIN_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 10000;

function validateHost(host) {
  let url;
  try {
    url = new URL(host);
  } catch {
    throw new Error("TBS host must be a valid HTTP or HTTPS URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("TBS host must be a base HTTP or HTTPS URL without credentials or path");
  }
  return url.origin;
}

function validateMid(mid) {
  if (
    typeof mid !== "string" ||
    !mid.trim() ||
    mid.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(mid)
  ) {
    const error = new Error("A valid stream mid is required");
    error.statusCode = 400;
    throw error;
  }
  return mid.trim();
}

function validateMods(mods) {
  if (
    !Array.isArray(mods) ||
    mods.length === 0 ||
    mods.some((mod) => !SUPPORTED_MOD_SET.has(mod))
  ) {
    const error = new Error("Unsupported or empty TBS stream module list");
    error.statusCode = 400;
    throw error;
  }
  return [...new Set(mods)];
}

class TbsClient {
  constructor(
    { id, name, host, username, password },
    { httpClient = axios, commandDelayMs = 350 } = {},
  ) {
    if (!id || typeof username !== "string" || typeof password !== "string") {
      throw new Error("TBS device requires an id, username, and password");
    }
    this.id = id;
    this.name = name || id;
    this.host = validateHost(host);
    this.username = username;
    this.password = password;
    this.httpClient = httpClient;
    this.commandDelayMs = commandDelayMs;

    this.sessionCookie = null;
    this.loginPromise = null;
    this.lastAuthAt = null;
    this.queue = Promise.resolve();
  }

  async getSessionCookie(forceRefresh = false) {
    if (this.sessionCookie && !forceRefresh) return this.sessionCookie;
    if (this.loginPromise) return this.loginPromise;

    this.loginPromise = this.performLogin().finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }

  invalidateSession() {
    this.sessionCookie = null;
  }

  extractCookie(setCookieHeader) {
    if (!setCookieHeader) return null;
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];
    return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  }

  async performLogin() {
    const portalUrl = `${this.host}/portal/`;
    const initResponse = await this.httpClient.get(portalUrl, {
      maxRedirects: 0,
      timeout: LOGIN_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const initialCookie = this.extractCookie(
      initResponse.headers?.["set-cookie"],
    );
    if (!initialCookie) {
      throw new Error(`[${this.id}] Authentication did not return a session cookie`);
    }

    const landingHtml = String(initResponse.data || "");
    const signInMatch = landingHtml.match(
      /href=["'](\/portal\/\?[^"']+)["'][^>]*>\s*Sign in/i,
    );
    if (!signInMatch) {
      throw new Error(`[${this.id}] Could not locate the sign-in link`);
    }

    const signInUrl = `${this.host}${signInMatch[1]}`;
    const signInResponse = await this.httpClient.get(signInUrl, {
      maxRedirects: 0,
      timeout: LOGIN_TIMEOUT_MS,
      headers: { Cookie: initialCookie, Referer: portalUrl },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const signInHtml = String(signInResponse.data || "");
    const formAction = signInHtml.match(/<form[^>]+action=["']([^"']+)["']/i);
    const loginPath = formAction ? formAction[1] : signInMatch[1];
    const loginUrl = loginPath.startsWith("http")
      ? loginPath
      : new URL(loginPath, this.host).href;
    if (new URL(loginUrl).origin !== this.host) {
      throw new Error(`[${this.id}] Sign-in form points to an unexpected host`);
    }

    const formData = new URLSearchParams({
      dologin: "!",
      username: this.username,
      password: this.password,
    });
    const loginResponse = await this.httpClient.post(
      loginUrl,
      formData.toString(),
      {
        maxRedirects: 0,
        timeout: LOGIN_TIMEOUT_MS,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          Cookie: initialCookie,
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: signInUrl,
        },
      },
    );
    const activeCookie =
      this.extractCookie(loginResponse.headers?.["set-cookie"]) ||
      initialCookie;
    const verifyResponse = await this.httpClient.get(portalUrl, {
      timeout: LOGIN_TIMEOUT_MS,
      maxRedirects: 0,
      headers: { Cookie: activeCookie },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const verifyHtml = String(verifyResponse.data || "");
    if (
      verifyHtml.includes('loginstate == "failed"') ||
      /href=["']\/portal\/\?[^"']+["'][^>]*>\s*Sign in/i.test(verifyHtml)
    ) {
      throw new Error(`[${this.id}] Sign-in failed; check the device credentials`);
    }

    this.sessionCookie = activeCookie;
    this.lastAuthAt = new Date().toISOString();
    return activeCookie;
  }

  async get(relativePath, retry = true) {
    const cookie = await this.getSessionCookie();
    const url = new URL(relativePath, `${this.host}/`).href;
    if (new URL(url).origin !== this.host) {
      throw new Error("TBS request path resolved to an unexpected host");
    }

    let response;
    try {
      response = await this.httpClient.get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 0,
        headers: {
          Cookie: cookie,
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${this.host}/portal/`,
        },
        validateStatus: (status) => status >= 200 && status < 500,
      });
    } catch (error) {
      if (retry && [401, 403].includes(error.response?.status)) {
        this.invalidateSession();
        return this.get(relativePath, false);
      }
      throw error;
    }

    const bodyText =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
    const sessionExpired =
      [401, 403].includes(response.status) ||
      /href=["']\/portal\/\?[^"']+["'][^>]*>\s*Sign in/i.test(bodyText) ||
      bodyText.includes("<status>denied</status>") ||
      bodyText.includes("!serr");
    if (retry && sessionExpired) {
      this.invalidateSession();
      return this.get(relativePath, false);
    }
    if (response.status >= 400) {
      const error = new Error(`TBS request failed with status ${response.status}`);
      error.statusCode = 502;
      throw error;
    }
    return response.data;
  }

  enqueue(fn) {
    const task = this.queue.then(async () => {
      const result = await fn();
      if (this.commandDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.commandDelayMs),
        );
      }
      return result;
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async getStreams(mods = ["cdn"]) {
    const selectedMods = validateMods(mods);
    const xml = await this.get("/portal/?app=dvbstat");
    const streams = parseDvbStatXml(xml, selectedMods);
    const diagnostics =
      streams.length === 0 ? inspectDvbStatXml(xml) : undefined;
    if (diagnostics) {
      console.warn(
        `[TBS parser] No streams parsed for ${this.id}:`,
        JSON.stringify(diagnostics),
      );
    }
    return {
      tbsId: this.id,
      tbsName: this.name,
      fetchedAt: new Date().toISOString(),
      count: streams.length,
      streams,
      ...(diagnostics ? { diagnostics } : {}),
    };
  }

  async getStream(mid, mods = SUPPORTED_MODS) {
    const validMid = validateMid(mid);
    const { streams } = await this.getStreams(mods);
    const stream = streams.find((item) => item.mid === validMid);
    if (!stream) {
      const error = new Error(`Stream "${validMid}" not found on ${this.id}`);
      error.statusCode = 404;
      throw error;
    }
    return stream;
  }

  restartStream(mid, mod = "cdn") {
    const validMid = validateMid(mid);
    const [validMod] = validateMods([mod]);
    return this.enqueue(async () => {
      const path =
        `/portal/?app=dvbact&mod=${encodeURIComponent(validMod)}` +
        `&mid=${encodeURIComponent(validMid)}&cmd=kill`;
      const response = await this.get(path);
      const body = String(response || "");
      const ok = !/<status>\s*error\s*<\/status>/i.test(body);
      return {
        ok,
        tbsId: this.id,
        mod: validMod,
        mid: validMid,
        cmd: "kill",
        executedAt: new Date().toISOString(),
        status: body.match(/<status>([^<]*)<\/status>/i)?.[1] || null,
      };
    });
  }
}

module.exports = TbsClient;
