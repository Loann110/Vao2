import os
import unittest
from unittest.mock import patch

from backend.llm.runtime import select_runtime_config


class RuntimeConfigTests(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    def test_compact_mobile_class_device(self):
        config = select_runtime_config(4, 4 * 1024**3, "aarch64")
        self.assertEqual(config.profile, "compact")
        self.assertEqual(config.threads, 3)
        self.assertEqual(config.batch, 64)

    @patch.dict(os.environ, {}, clear=True)
    def test_balanced_computer(self):
        config = select_runtime_config(8, 8 * 1024**3, "x86_64")
        self.assertEqual(config.profile, "balanced")
        self.assertEqual(config.threads, 4)

    @patch.dict(os.environ, {}, clear=True)
    def test_performance_computer_and_gpu(self):
        config = select_runtime_config(24, 32 * 1024**3, "AMD64", True)
        self.assertEqual(config.profile, "performance")
        self.assertEqual(config.threads, 8)
        self.assertEqual(config.gpu_layers, -1)

    @patch.dict(
        os.environ,
        {"VAO2_MODEL_THREADS": "3", "VAO2_MODEL_BATCH": "96"},
        clear=True,
    )
    def test_environment_overrides_automatic_values(self):
        config = select_runtime_config(24, 32 * 1024**3, "x86_64", True)
        self.assertEqual(config.threads, 3)
        self.assertEqual(config.batch, 96)


if __name__ == "__main__":
    unittest.main()
