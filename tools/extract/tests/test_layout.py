from calcrim_extract.layout import _is_white, _visible


def test_white_fill_detection():
    assert _is_white((0.0, 0.0, 0.0, 0.0))  # CMYK white
    assert _is_white((1, 1, 1))
    assert _is_white(1.0)
    assert _is_white((1.0,))
    assert not _is_white((0.0, 0.0, 0.0, 1.0))  # CMYK black
    assert not _is_white((0, 0, 0))
    assert not _is_white(None)


def test_white_text_is_not_visible():
    base = {"size": 12.0, "fontname": "Times-Bold"}
    assert _visible({**base, "non_stroking_color": (0.0, 0.0, 0.0, 1.0)})
    assert not _visible({**base, "non_stroking_color": (0.0, 0.0, 0.0, 0.0)})
