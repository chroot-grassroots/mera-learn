"""
Solid Pod loading and saving module for Mera platform.
"""

import js
from .solid_auth import SolidAuth


class LessonProgress(SolidAuth):
    """Handles lesson progress storage in Solid Pods, inherits authentication"""
    
    def __init__(self, debug_callback=None):
        """Initialize with Solid authentication capabilities."""
        super().__init__(debug_callback)

    async def save_lesson_progress(self, lesson_id, progress_data):
        """
        Save lesson progress to the user's Solid Pod.

        Args:
            lesson_id (str): Unique lesson identifier
            progress_data (dict): Progress data to save

        Returns:
            bool: True if saved successfully, False otherwise
        """
        if not self.pod_url:
            self.debug("⚠ No pod URL available - user may not be logged in")
            return False

        try:
            # Ensure directory structure exists
            container_url = f"{self.pod_url}private/mera-education/lessons/"
            await self.ensure_directory_exists(container_url)

            # Create the full file URL
            file_url = f"{container_url}{lesson_id}.json"
            self.debug(f"💾 Saving progress to: {file_url}")

            # Convert progress data to JSON string
            json_data = js.JSON.stringify(progress_data)

            # Create a blob with the JSON data
            file_blob = js.Blob.new(
                [json_data], js.Object.fromEntries([["type", "application/json"]])
            )

            # Use overwriteFile instead of saveFileInContainer
            saved_file = await js.window.solidClient.overwriteFile(
                file_url,
                file_blob,
                js.Object.fromEntries(
                    [["fetch", self.session.fetch], ["contentType", "application/json"]]
                ),
            )

            self.debug("✅ Progress saved successfully!")
            return True

        except Exception as e:
            self.debug(f"⚠ Error saving progress: {e}")
            return False

    async def load_lesson_progress(self, lesson_id):
        """
        Load lesson progress from the user's Solid Pod.

        Args:
            lesson_id (str): Unique lesson identifier

        Returns:
            dict: Progress data or None if not found
        """
        if not self.pod_url:
            self.debug("⚠ No pod URL available - user may not be logged in")
            return None

        try:
            file_url = f"{self.pod_url}private/mera-education/lessons/{lesson_id}.json"
            self.debug(f"📂 Loading progress from: {file_url}")

            # Use Solid client with authenticated fetch
            file_data = await js.window.solidClient.getFile(
                file_url, js.Object.fromEntries([["fetch", self.session.fetch]])
            )

            # Convert blob to text and parse JSON
            json_text = await file_data.text()
            progress_data = js.JSON.parse(json_text)

            self.debug(f"✅ Progress loaded for lesson: {lesson_id}")
            return progress_data

        except Exception as e:
            self.debug(f"🔍 No saved progress found for lesson: {lesson_id} ({e})")
            return None