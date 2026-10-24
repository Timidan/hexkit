// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import InterfaceTool from "./InterfaceTool";
import ScenarioTool from "./ScenarioTool";
import example from "../../../../public/vara/scenario.json";
import sailsExample from "../../../../public/vara/sails-scenario.json";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("compares the bundled call against the edited example interface", async () => {
  render(<InterfaceTool />);
  fireEvent.click(screen.getByRole("button", { name: "Load breaking-change example" }));
  fireEvent.click(screen.getByRole("button", { name: "Compare interfaces" }));
  await screen.findByRole("heading", { name: "1 interface changes" });
  expect(screen.getByText("BasketMarket.FinalizeSettlement", { selector: "code" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Saved call 1 · Before: round-trip matches · After: invalid" })).toBeTruthy();
});

it("locks the scenario editor while loading and preserves it if the next example fails", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("/health")
    ? Promise.resolve(Response.json({ ready: true, runtime: "gtest 2.0.0" }))
    : new Promise<Response>((resolve) => { finish = resolve; })));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ScenarioTool /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Examples" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Try counter example" }));
  expect(screen.getByText("Loading example…")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Run scenario" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("Scenario name") as HTMLInputElement).disabled).toBe(true);
  finish(Response.json(example));
  await waitFor(() => expect((screen.getByLabelText("Scenario name") as HTMLInputElement).value).toBe(example.name));
  expect((screen.getByRole("button", { name: "Run scenario" }) as HTMLButtonElement).disabled).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Examples" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Try async example" }));
  finish(new Response("Unavailable", { status: 503 }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toBe("Example could not be loaded. Try again.");
  expect((screen.getByLabelText("Scenario name") as HTMLInputElement).value).toBe(example.name);
  expect((screen.getByRole("button", { name: "Examples" }) as HTMLButtonElement).disabled).toBe(false);
});

it("shows an imported typed call without replacing its encoded bytes", async () => {
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(Response.json(url.endsWith("/health") ? { ready: true, runtime: "gtest 2.0.0" } : sailsExample))));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ScenarioTool /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Examples" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Try Sails example" }));
  fireEvent.click(await screen.findByRole("button", { name: /Tally\.Add\(7\)/ }));
  expect(await screen.findByRole("option", { name: "Keep encoded call (Tally.Add)" })).toBeTruthy();
  expect(screen.getByText(/^Encoded call:/).textContent).toBe("Encoded call: Tally.Add(amount: 7)");
  expect((screen.getByLabelText("Payload (hex)") as HTMLTextAreaElement).value).toBe(sailsExample.steps[1].payload);
});
