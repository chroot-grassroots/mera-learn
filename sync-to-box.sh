#!/bin/bash
# Sync development files to Box

SOURCE_DIR="$(pwd)"
REMOTE_NAME="box"
TARGET_PATH="Development/mera-learn"

echo "Syncing mera-learn to Box..."

rclone sync "$SOURCE_DIR" "$REMOTE_NAME:$TARGET_PATH" \
    --exclude-from=.rclone-exclude \
    --progress \
    --transfers 8 \
    --checkers 16

echo "✅ Sync complete! Files available in Box/Development/mera-learn"