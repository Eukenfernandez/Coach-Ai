# Video Context Architecture

## Strategy
Process the video once into persistent multimodal memory, then answer each chat turn by retrieving:

- global technical summary
- active segment at the current timestamp
- adjacent segments for before/after context
- nearby frame window captured at query time
- key moments and semantic segment matches
- optional pose snapshot when MediaPipe is active

This avoids the two weak extremes:

- isolated single-frame analysis without temporal context
- resending the full video on every question

## Production flow
1. Upload video to Firebase Storage and register it in Firestore.
2. Launch background context preparation without blocking the UI.
3. Browser extracts deterministic sampling artifacts once:
   - metadata
   - representative frames across the full clip
   - temporal scaffold for segments
4. Firebase Function `upsertVideoContext` turns those artifacts into reusable video memory:
   - global summary
   - timeline summary
   - segments
   - key moments
   - embeddings per segment
5. Chat calls `askVideoQuestion` with:
   - current timestamp
   - current frame
   - nearby temporal window
   - retrieved context from Firestore
   - recent chat history
   - biomechanics rules from the athlete profile
6. Backend stores session messages plus the exact context trace used by the answer.

## Data model
- `userdata/{uid}/videos/{videoId}`
- `userdata/{uid}/videoContexts/{videoId}`
- `userdata/{uid}/videoContexts/{videoId}/segments/{segmentId}`
- `userdata/{uid}/videoContexts/{videoId}/chatSessions/{sessionId}`
- `userdata/{uid}/videoContexts/{videoId}/chatSessions/{sessionId}/messages/{messageId}`

## Fallbacks
- `queued` or `summarizing`: answer with current frame + nearby window and lower confidence.
- `partial`: use partial global memory plus local frame window.
- `failed`: allow retry and keep the chat working with local visual context only.

## Why not send the full video every time
- higher latency
- higher cost
- less predictable stability on long clips
- repeated work on identical context
- worse scalability for chat-like interaction

The chosen design amortizes heavy work once and keeps per-turn latency close to a retrieval + small multimodal call.
