import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const models = vi.hoisted(() => [
  { detectForVideo: vi.fn(() => ({ landmarks: [] })) },
  { detectForVideo: vi.fn(() => ({ landmarks: [] })) },
]);
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  PoseLandmarker: {
    createFromOptions: vi.fn().mockResolvedValueOnce(models[0]).mockResolvedValueOnce(models[1]),
  },
}));
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import { usePoseDetection } from "../../hks/usePoseDetection";

afterEach(() => vi.unstubAllGlobals());

it("caps pose inference near 12 Hz and skips unchanged comparison frames", async () => {
  vi.mocked(PoseLandmarker.createFromOptions).mockResolvedValue(models[1] as unknown as PoseLandmarker);
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  const primary = { current: { currentTime: 0, readyState: 2, videoWidth: 640 } as HTMLVideoElement };
  const secondary = { current: { currentTime: 0, readyState: 2, videoWidth: 640 } as HTMLVideoElement };
  const { result, unmount } = renderHook(() => usePoseDetection(primary, true, secondary));
  await waitFor(() => expect(result.current.isReady).toBe(true));
  // Allow the separate comparison model to finish loading.
  await act(async () => {});
  const tick = (timestamp: number) =>
    act(() => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(timestamp));
    });
  for (let frame = 0; frame <= 240; frame++) {
    primary.current.currentTime = frame / 240;
    tick((frame * 1000) / 240);
  }
  expect(models[0].detectForVideo.mock.calls.length).toBeGreaterThanOrEqual(11);
  expect(models[0].detectForVideo.mock.calls.length).toBeLessThanOrEqual(13);
  expect(models[1].detectForVideo).toHaveBeenCalledTimes(1);
  secondary.current.currentTime = 2;
  tick(1100);
  expect(models[1].detectForVideo).toHaveBeenCalledTimes(2);
  tick(1200);
  expect(models[1].detectForVideo).toHaveBeenCalledTimes(2);
  unmount();
  expect(callbacks.size).toBe(0);
});
