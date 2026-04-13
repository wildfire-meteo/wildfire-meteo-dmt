# ODET Wildfire - meteorology analysis

Online [skew-T log-p](https://en.wikipedia.org/wiki/Skew-T_log-P_diagram) tool for analysing wildfire - meteorology interactions, developed in the [ODET](https://www.paucostafoundation.org/en/odet-kicks-off-to-boost-europes-preparedness-for-extreme-wildfire-behaviour/) project.  

Live demo: https://wildfire-meteo-35f3381e.fastapicloud.dev/

Suggestion/issues: https://github.com/wildfire-meteo/wildfire-meteo-dmt/issues

## Local install

New:
- Create empty `venv` with `python -m venv /path/to/venv`
- Load venv with `source /path/to/venv/bin/activate`
- Install package locally with `pip install -e .`
- Start server locally, run `fastapi dev` or `fastapi run`

To deploy to FastAPI cloud:
- `fastapi login`
- `fastapi deploy`
