#!/bin/bash
# Sync development files to Google Drive

SOURCE_DIR="$(pwd)"
REMOTE_NAME="gdrive"
TARGET_PATH="Development/jura-learn"

echo "Syncing jura-learn to Google Drive..."

rclone sync "$SOURCE_DIR" "$REMOTE_NAME:$TARGET_PATH" \
    --exclude-from=.rclone-exclude \
    --progress \
    --transfers 8 \
    --checkers 16

echo "✅ Sync complete! Files available in Google Drive/Development/jura-learn"