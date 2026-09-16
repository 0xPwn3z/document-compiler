import unittest

from app.main import parse_header


class ParseHeaderTests(unittest.TestCase):
    def test_multipart_content_type(self):
        ctype, params = parse_header("multipart/form-data; boundary=abc123")
        self.assertEqual(ctype, "multipart/form-data")
        self.assertEqual(params, {"boundary": "abc123"})

    def test_quoted_parameter(self):
        ctype, params = parse_header('multipart/form-data; boundary="weird boundary"')
        self.assertEqual(ctype, "multipart/form-data")
        self.assertEqual(params, {"boundary": "weird boundary"})

    def test_plain_value(self):
        ctype, params = parse_header("text/html")
        self.assertEqual(ctype, "text/html")
        self.assertEqual(params, {})


if __name__ == "__main__":
    unittest.main()
