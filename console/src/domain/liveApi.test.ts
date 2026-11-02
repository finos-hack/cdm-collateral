import { serviceUrl } from "./liveApi";

describe("serviceUrl", () => {
  it("defaults to the local service ports", () => {
    expect(serviceUrl("A", {})).toBe("http://localhost:8001");
    expect(serviceUrl("B", {})).toBe("http://localhost:8002");
  });

  it("uses the same-origin proxy path when VITE_SERVICE_PROXY=1", () => {
    expect(serviceUrl("A", { VITE_SERVICE_PROXY: "1" })).toBe("/svc/A");
    expect(serviceUrl("B", { VITE_SERVICE_PROXY: "1" })).toBe("/svc/B");
  });

  it("prefers an explicit service URL over the proxy", () => {
    expect(serviceUrl("A", { VITE_SERVICE_PROXY: "1", VITE_SERVICE_A_URL: "http://a:9" })).toBe("http://a:9");
    expect(serviceUrl("B", { VITE_SERVICE_PROXY: "1", VITE_SERVICE_A_URL: "http://a:9" })).toBe("/svc/B");
  });
});
