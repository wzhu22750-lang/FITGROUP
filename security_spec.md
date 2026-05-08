# FitGroup Security Specification

## Data Invariants
1. A `WorkoutLog` must have a valid `userId` matching the authenticated user's UID.
2. `likesCount` and `commentsCount` can only be incremented/decremented via a trusted batch or system (modeled as client-side for now with checks, but in production ideally functions).
3. Users can only edit or delete their own `WorkoutLog`.
4. Anyone authenticated can read `workoutLogs`.
5. `Like` and `Comment` subcollections must have a `userId` matching the creator.

## The Dirty Dozen Payloads (Unauthorized Attempts)

1. **Identity Spoofing**: Creating a `WorkoutLog` with someone else's `userId`.
2. **Shadow Field**: Adding `isVerified: true` to a user profile.
3. **Ghost Field**: Adding `admin: true` to a workout log.
4. **ID Poisoning**: Using a 1MB string as a `logId`.
5. **State Shortcut**: Setting `likesCount` to 999999 manually.
6. **Orphaned Like**: Liking a non-existent workout log.
7. **Unauthorized Write**: Deleting someone else's workout log.
8. **Invalid Data Type**: Sending `weight: "heavy"` instead of a number.
9. **Resource Exhaustion**: Sending 10,000 exercises in one log.
10. **Timestamp Manipulation**: Sending a `timestamp` from the future.
11. **PII Leak**: Accessing another user's private settings (if any were added).
12. **Self-Promotion**: Incrementing own `streak` without a workout log.

## Verification
Rules will be validated against these scenarios.
