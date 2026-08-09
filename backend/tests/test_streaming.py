import unittest
from unittest.mock import patch

from backend.llm import llm


class StreamingSummaryTests(unittest.TestCase):
    def test_summary_is_exposed_chunk_by_chunk(self):
        with patch.object(llm, "generate_stream", return_value=iter(["First ", "result."])):
            chunks = list(llm.short_summary_stream("Title", "A useful article sentence."))
        self.assertEqual(chunks, [("First ", True), ("result.", True)])

    def test_source_excerpt_is_streamed_when_ai_is_unavailable(self):
        with patch.object(llm, "generate_stream", return_value=iter(())):
            chunks = list(llm.short_summary_stream("Title", "Fallback article text."))
        self.assertEqual(chunks, [("Fallback article text.", False)])


if __name__ == "__main__":
    unittest.main()
