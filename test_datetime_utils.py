import unittest
from datetime import timezone
from zoneinfo import ZoneInfo

from datetime_utils import parse_datetime_to_utc, timezone_from_name


class DateTimeUtilsTests(unittest.TestCase):
    def test_explicit_utc_timestamp_is_preserved(self):
        parsed = parse_datetime_to_utc(
            "2026-09-05T04:59:00Z",
            ZoneInfo("America/Chicago"),
        )
        self.assertEqual(parsed.isoformat(), "2026-09-05T04:59:00+00:00")

    def test_naive_summer_time_uses_course_timezone(self):
        parsed = parse_datetime_to_utc(
            "2026-09-04T23:59:00",
            ZoneInfo("America/Chicago"),
        )
        self.assertEqual(parsed.isoformat(), "2026-09-05T04:59:00+00:00")

    def test_naive_winter_time_uses_standard_offset(self):
        parsed = parse_datetime_to_utc(
            "2026-12-04T23:59:00",
            ZoneInfo("America/Chicago"),
        )
        self.assertEqual(parsed.isoformat(), "2026-12-05T05:59:00+00:00")

    def test_explicit_offset_wins_over_default_timezone(self):
        parsed = parse_datetime_to_utc(
            "2026-09-04T23:59:00-04:00",
            ZoneInfo("America/Chicago"),
        )
        self.assertEqual(parsed.isoformat(), "2026-09-05T03:59:00+00:00")

    def test_invalid_timezone_falls_back_to_utc(self):
        self.assertIs(timezone_from_name("Not/A_Timezone"), timezone.utc)


if __name__ == "__main__":
    unittest.main()
