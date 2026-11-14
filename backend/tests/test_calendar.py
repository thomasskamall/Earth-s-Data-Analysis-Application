import calendar
import numpy as np
from app import stats, power

def test_day_weighted_monthly_rate_uses_actual_leap_year_lengths():
    for year in [2000, 2001]:
        monthly = [(f'{year}-{m:02d}', 100. if m == 2 else 0.) for m in range(1, 13)]
        value = stats.analyse(monthly)['annual'][0]['value']
        total_days = sum(calendar.monthrange(year, m)[1] for m in range(1, 13))
        assert np.isclose(value, 100. * calendar.monthrange(year, 2)[1] / total_days)
        assert not np.isclose(value, 100. / 12)

def test_calendar_grid_exposes_omitted_month_as_missing():
    raw = [[f'2000-{m:02d}', 4.] for m in range(1, 13) if m != 7]
    cut = power.cut({'values': raw}, 2000, 2000)
    assert cut['months_inserted'] == 1
    assert cut['values'][6] == ('2000-07', None)
    result = stats.analyse(cut['values'])
    assert result['coverage']['n_input_months'] == 12
    assert result['coverage']['n_valid_months'] == 11
    assert result['annual'][0]['complete_12_months'] is False
    assert result['months_missing'] == 1

def test_running_mean_never_bridges_an_omitted_calendar_month():
    monthly = [(f'{year}-{m:02d}', 4.) for year in [2000, 2001, 2002] for m in range(1, 13) if f'{year}-{m:02d}' != '2001-06']
    running = stats.running_mean(monthly)
    index = next(i for i, (date, _) in enumerate(monthly) if date == '2001-05')
    assert running[index] is None
