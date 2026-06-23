# Metric reliability

The social metric job now validates channel-specific ranges before replacing a known value. This prevents unrelated counts found in a platform page from overwriting the correct account.

The public collector tries multiple profile variants for Instagram, Facebook, Snapchat and X. When a platform does not expose its count to logged-out requests, the website keeps the last verified value and links directly to the profile instead of displaying an invented number.

For the most reliable official values, the existing workflow supports these optional repository secrets:

- `YOUTUBE_API_KEY`
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `META_ACCESS_TOKEN`
