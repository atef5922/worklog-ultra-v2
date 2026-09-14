import { createRequire } from "node:module";
import { PassThrough, Readable } from "node:stream";
import { createElement, type ReactNode } from "react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardKpiCards, type DashboardKpiCard } from "./dashboard-kpi-cards";

vi.mock("@/components/dashboard/dashboard-work-plan-table", () => ({ buildTaskDetails: vi.fn() }));
vi.mock("@/components/dashboard/task-details-modal", () => ({ TaskDetailsModal: () => null }));
vi.mock("next/image", () => ({ default: ({ alt, src }: { alt: string; src: string }) => createElement("img", { alt, src }) }));

const load = createRequire(import.meta.url);
const { createFromNodeStream } = load("next/dist/compiled/react-server-dom-webpack/client.node") as {
  createFromNodeStream: (stream: Readable, manifest: { moduleMap: object; serverModuleMap: object; moduleLoading: null }) => Promise<{ trailingCard: ReactNode }>;
};
const manifest = { moduleMap: {}, serverModuleMap: {}, moduleLoading: null };
const cards: DashboardKpiCard[] = (["planned", "completed", "inProgress", "pending"] as const).map(key => ({
  key, title: key, value: 0, href: "/dashboard", icon: null, art: "/icon.svg", iconWrap: "", card: "", border: "", accent: "",
}));
const view = (trailingCard?: ReactNode) => createElement(DashboardKpiCards, {
  cards, tasks: [], currentUserId: "synthetic-employee", progress: { planned: 0, completed: 0, inProgress: 0, pending: 0 }, trailingCard,
});
const attendanceModel = '["$","div",null,{"data-dashboard-card":true,"title":"Attendance status","children":"Attendance"},null,null,2]';
afterEach(() => vi.restoreAllMocks());

describe("Dashboard KPI server-provided card slot", () => {
  it("renders a streamed server card without React key warnings or an extra grid wrapper", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const flight = new PassThrough();
    const decoded = createFromNodeStream(flight, manifest);
    flight.write('0:{"trailingCard":"$L1"}\n');
    const { trailingCard } = await decoded;
    const html = await new Promise<string>((resolve, reject) => {
      const destination = new PassThrough();
      let output = "";
      destination.on("data", chunk => { output += chunk.toString(); });
      destination.on("end", () => resolve(output));
      const render = renderToPipeableStream(view(trailingCard), {
        onAllReady() { render.pipe(destination); }, onError: reject,
      });
      setImmediate(() => flight.end(`1:${attendanceModel}\n`));
    });
    expect(errors.mock.calls.map(args => args.join(" "))).toEqual([]);
    expect(html.match(/data-dashboard-card="true"/g)).toHaveLength(5);
    expect(html).toContain('title="Attendance status">Attendance</div></section>');
  });

  it.each([null, undefined])("keeps only the four KPI cards when the trailing card is %s", trailingCard => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(view(trailingCard));
    expect(html.match(/data-dashboard-card="true"/g)).toHaveLength(4);
    expect(errors).not.toHaveBeenCalled();
  });
});
