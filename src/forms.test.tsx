import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Context, type DataContext } from "./data";
import { UploadForm } from "./forms";

class FakeXHR {
  static instance: FakeXHR;
  status = 202;
  responseText = "";
  timeout = 0;
  upload = { onprogress: null as null | ((event: ProgressEvent) => void) };
  onload: null | (() => Promise<void>) = null;
  onerror: null | (() => void) = null;
  ontimeout: null | (() => void) = null;
  open = vi.fn();
  send = vi.fn();
  constructor() {
    FakeXHR.instance = this;
  }
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(refresh = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  const close = vi.fn();
  const context = {
    sessions: [{ id: 7, title: "Test session", is_demo: 0 }],
    refresh,
  } as unknown as DataContext;
  render(
    <Context.Provider value={context}>
      <UploadForm sessionId={7} onClose={close} />
    </Context.Provider>,
  );
  return { close, refresh };
}
// user-event patches the public FileList, while jsdom native required-file
// validation reads its private implementation list. These component tests
// explicitly dispatch submit after asserting the selected-file UI is enabled;
// native file-picker submission remains a separate browser verification step.
function submitSelectedFile() {
  expect(
    screen.getByRole("button", { name: "Upload & analyze" }),
  ).toBeEnabled();
  const input = screen.getByLabelText("Recording file") as HTMLInputElement;
  expect(input.files).toHaveLength(1);
  fireEvent.submit(input.form!);
}
test("accepted upload refreshes job state and closes the dialog", async () => {
  const { close, refresh } = mount();
  await userEvent.upload(
    screen.getByLabelText("Recording file"),
    new File(["wave"], "test.wav", { type: "audio/wav" }),
  );
  submitSelectedFile();
  expect(FakeXHR.instance.open).toHaveBeenCalledWith(
    "POST",
    "/api/sessions/7/media",
  );
  expect(FakeXHR.instance.send).toHaveBeenCalledWith(expect.any(FormData));
  await act(async () => {
    await FakeXHR.instance.onload?.();
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
test("accepted upload with refresh failure is recoverable without duplicate submission", async () => {
  mount(vi.fn().mockRejectedValue(new Error("offline")));
  await userEvent.upload(
    screen.getByLabelText("Recording file"),
    new File(["wave"], "test.wav", { type: "audio/wav" }),
  );
  submitSelectedFile();
  await act(async () => {
    await FakeXHR.instance.onload?.();
  });
  await screen.findByText(
    /Recording received, but its status could not be refreshed/,
  );
  expect(
    screen.getByRole("button", { name: "Upload & analyze" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
});
test("upload error exposes the backend reason and enables retry", async () => {
  mount();
  await userEvent.upload(
    screen.getByLabelText("Recording file"),
    new File(["wave"], "test.wav", { type: "audio/wav" }),
  );
  submitSelectedFile();
  FakeXHR.instance.status = 409;
  FakeXHR.instance.responseText = JSON.stringify({
    error: { message: "Another recording is being analyzed." },
  });
  await act(async () => {
    await FakeXHR.instance.onload?.();
  });
  await screen.findByText("Another recording is being analyzed.");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Upload & analyze" }),
    ).toBeEnabled(),
  );
});
