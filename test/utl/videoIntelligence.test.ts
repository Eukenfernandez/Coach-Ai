import { describe, expect, it, vi } from "vitest";
import { captureSamplingArtifacts, waitForVideoIdle } from "../../utl/videoIntelligence";

describe("background video sampling", () => {
  it("waits for pause/end and supports cancellation", async () => {
    const video = document.createElement("video");
    let paused = false;
    Object.defineProperty(video, "paused", { get: () => paused });
    const resolved = vi.fn();
    const pending = waitForVideoIdle(video).then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    paused = true;
    video.dispatchEvent(new Event("pause"));
    await pending;
    expect(resolved).toHaveBeenCalledOnce();

    paused = false;
    const ended = waitForVideoIdle(video);
    Object.defineProperty(video, "ended", { value: true });
    video.dispatchEvent(new Event("ended"));
    await ended;

    const controller = new AbortController();
    controller.abort();
    await expect(waitForVideoIdle(video, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("defers extraction during playback, resumes between samples and preserves base64 JPEG", async () => {
    const player = document.createElement("video");
    let paused = false;
    Object.defineProperty(player, "paused", { get: () => paused });
    const source = document.createElement("video");
    let time = 0;
    Object.defineProperties(source, {
      readyState: { value: 2 },
      duration: { value: 6 },
      videoWidth: { value: 1280 },
      videoHeight: { value: 720 },
      currentTime: {
        get: () => time,
        set: (value) => {
          time = value;
          queueMicrotask(() => source.dispatchEvent(new Event("seeked")));
        },
      },
    });
    vi.spyOn(source, "pause").mockImplementation(() => {});
    vi.spyOn(source, "load").mockImplementation(() => {});
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "video" ? source : createElement(tag),
    );
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const syncEncode = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");
    let encoded = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => {
      expect(type).toBe("image/jpeg");
      if (++encoded === 1) {
        paused = false;
        player.dispatchEvent(new Event("play"));
      }
      callback(new Blob(["jpeg"], { type: "image/jpeg" }));
    });
    const result = captureSamplingArtifacts({
      source: "sample.mp4",
      durationSeconds: 6,
      playbackVideo: player,
    });
    await Promise.resolve();
    expect(drawImage).not.toHaveBeenCalled();
    paused = true;
    player.dispatchEvent(new Event("pause"));
    await vi.waitFor(() => expect(encoded).toBe(1));
    expect(drawImage).toHaveBeenCalledTimes(1);
    paused = true;
    player.dispatchEvent(new Event("pause"));
    const { plan, samples } = await result;
    expect(samples).toHaveLength(plan.length);
    expect(samples[0]).toMatchObject({ base64Jpeg: "anBlZw==", width: 960, height: 540 });
    expect(syncEncode).not.toHaveBeenCalled();
  });
});
