# FAMILY_ROOM Durable Object binding contract

The code is ready for a room-scoped Durable Object namespace, but the current
ChatGPT Sites resource manifest does not provision that binding.

When the hosting control plane supports/creates the binding, use:

- binding name: `FAMILY_ROOM`
- class name: `FamilyRoomDurableObject`
- worker export: `server/worker.ts`
- object key: Family room ID via `idFromName(roomId)`

For a direct Wrangler deployment, the equivalent configuration shape is:

```jsonc
{
  "main": "./server/worker.ts",
  "durable_objects": {
    "bindings": [
      {
        "name": "FAMILY_ROOM",
        "class_name": "FamilyRoomDurableObject"
      }
    ]
  },
  "migrations": [
    {
      "tag": "family-room-v1",
      "new_classes": ["FamilyRoomDurableObject"]
    }
  ]
}
```

Do not add this block to `.openai/hosting.json` unless the Sites hosting schema
explicitly supports it. The app intentionally treats the binding as optional so
the existing D1-backed deployment remains usable until provisioning exists.
