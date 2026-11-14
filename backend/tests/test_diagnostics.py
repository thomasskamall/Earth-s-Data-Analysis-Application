import numpy as np
from app import stats

def test_contiguous_residual_pairs_have_no_wraparound_or_double_offset():
    years = np.array([2000, 2001, 2003, 2004, 2005], dtype=float)
    residuals = np.array([2., -1., 4., 1., -3.])
    lag1, dw = stats._contiguous_residual_diagnostics(years, residuals)
    previous = np.array([2., 4., 1.])
    current = np.array([-1., 1., -3.])
    assert lag1 is not None and dw is not None
    assert np.isclose(lag1, np.corrcoef(previous, current)[0, 1])
    assert np.isclose(dw, np.sum((current - previous) ** 2) / np.sum(residuals ** 2))

def test_isolated_years_have_no_adjacent_year_diagnostics():
    years = np.array([2000, 2002, 2004], dtype=float)
    assert stats._contiguous_residual_diagnostics(years, np.array([1., 2., -1.])) == (None, None)
