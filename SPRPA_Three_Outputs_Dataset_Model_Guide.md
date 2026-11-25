# SPRPA --- Dataset and Model Specification for Three Required Outputs

## Project objective

This document is limited to the **three outputs required for the Stock
Portfolio Risk & Performance Analytics (SPRPA) project**:

1.  **10-day volatility forecast**
2.  **Anomaly dates, anomaly score and unusual movement indicators**
3.  **Financial news sentiment score between -1 and +1**

Only **one selected model** is recommended for each output. The model
choices follow the SPRPA Software Design Document (SDD), Section 4.5:

  -----------------------------------------------------------------------
  Required output         Selected model          Dataset required
  ----------------------- ----------------------- -----------------------
  10-day volatility       **GARCH(1,1)**          Historical Indian stock
  forecast                                        OHLCV data, using
                                                  back-adjusted closing
                                                  prices to calculate
                                                  returns

  Anomaly dates, anomaly  **Isolation Forest**    Historical Indian stock
  score and unusual                               OHLCV data
  movement indicators                             

  Sentiment score from -1 **VADER Sentiment       Indian financial news
  to +1                   Analyzer**              headlines
  -----------------------------------------------------------------------

The SDD explicitly lists GARCH(1,1), Isolation Forest and VADER for
these respective features. No additional models are proposed in this
implementation plan.

------------------------------------------------------------------------

# 1. Datasets to use

## Dataset A --- Indian stock market historical data

`<badge>`{=html}Primary market dataset`</badge>`{=html}

**Recommended source:** [TejHQ Indian Markets --- Hugging
Face](https://huggingface.co/datasets/tejhq/indian-markets)

**Source pipeline:** [TejHQ Tej-Bazaar GitHub
repository](https://github.com/tejhq/tej-bazaar)

Why this dataset is selected: - It describes end-of-day NSE/BSE data
sourced from official exchange Bhavcopy files. - The public Hugging Face
dataset exposes an NSE subset with millions of rows. - The repository
documents raw Bhavcopy data, corporate-action records and a separate
back-adjusted price dataset. - NSE history is documented from 2010
onward; BSE history begins later. - The documented raw fields include
date, symbol, OHLC prices, volume, turnover and trade count.

**Important data-source qualification:** This is an open third-party
pipeline built from exchange-published Bhavcopy data; it is not the
NSE's own hosted dataset. Exchange-published data is not automatically
covered by the repository's software licence. Review the source's
data-use terms before redistribution.

### Dataset columns available

The source documents the following fields in its raw Bhavcopy data:

  -----------------------------------------------------------------------
  Actual column           Meaning                 Use in this project
  ----------------------- ----------------------- -----------------------
  `date`                  Trading date            Sort observations and
                                                  identify
                                                  forecast/anomaly dates

  `symbol`                NSE/BSE ticker          Select and identify the
                                                  stock

  `series`                Exchange series code,   Filter the intended
                          such as NSE `EQ`        equity series; normally
                                                  use NSE `EQ` for the
                                                  initial implementation

  `isin`                  International           Instrument
                          Securities              identification and
                          Identification Number   corporate-action
                                                  continuity

  `name`                  Company/instrument name Display in the
                                                  application

  `open`                  Opening price           Calculate opening gap
                                                  indicator

  `high`                  Highest traded price    Calculate intraday
                          during the session      range indicator

  `low`                   Lowest traded price     Calculate intraday
                          during the session      range indicator

  `close`                 Closing price           Price history; use
                                                  adjusted close for
                                                  return calculations
                                                  when available

  `last`                  Last traded price       Not required for the
                                                  three selected model
                                                  inputs

  `prev_close`            Previous closing price  Calculate daily return
                                                  and opening gap

  `volume`                Total traded volume     Volume behaviour and
                                                  anomaly detection

  `turnover`              Total traded value in   Optional context for
                          rupees                  unusual activity

  `trades`                Number of trades        Optional context for
                          executed                unusual activity
  -----------------------------------------------------------------------

### Corporate-action and adjusted-price data

The source also documents separate data trees:

**Corporate actions (`actions/`)**

  -----------------------------------------------------------------------
  Actual column           Meaning                 Use
  ----------------------- ----------------------- -----------------------
  `exchange`              NSE or BSE              Exchange identification

  `symbol`                Stock ticker            Join with price data

  `isin`                  Instrument identifier   Corporate-action
                                                  mapping

  `company`               Issuer name             Reference

  `ex_date`               Ex-date of action       Apply/check adjustment

  `record_date`           Record date, when       Reference
                          available               

  `type`                  Dividend, split, bonus, Identify action type
                          rights, etc.            

  `ratio_num`,            Action ratio fields     Split/bonus adjustment
  `ratio_den`                                     

  `cash_amount`           Dividend cash amount    Dividend adjustment
                          per share               

  `face_value_from`,      Face value before/after Split adjustment
  `face_value_to`         split                   
  -----------------------------------------------------------------------

**Back-adjusted prices (`prices_adjusted/`)**

This tree has the same core price columns as Bhavcopy and additionally
documents:

  -------------------------------------------------------------------------
  Actual column             Meaning                 Use
  ------------------------- ----------------------- -----------------------
  `adj_factor_cumulative`   Cumulative              Audit/understand
                            corporate-action        adjusted price
                            adjustment factor       

  `adj_close`               Back-adjusted closing   **Preferred input price
                            price                   for return
                                                    calculations**
  -------------------------------------------------------------------------

Use the back-adjusted `adj_close` for return calculations when
available. The source documents its adjustment conventions and notes
that some corporate actions (such as demergers, rights, buybacks and
mergers) are not scaled in that series. Review those limitations before
interpreting returns around such events.

------------------------------------------------------------------------

## Dataset B --- Indian financial news headlines

`<badge>`{=html}News sentiment dataset`</badge>`{=html}

**Recommended source:** [Indian Financial News Sentiment & Stock
Movement Dataset ---
GitHub](https://github.com/Sid-istic/financial-news-sentiment-dataset-)

The repository describes: - More than 6,000 Indian financial
headlines. - Headlines collected from Google News using company and
financial keywords. - NSE-listed ticker mapping. - More than 1,000
headlines with manually reviewed sentiment labels. - A CC BY 4.0
licence, as stated in its repository.

### Dataset columns

  -----------------------------------------------------------------------
  Actual column           Meaning                 Use in this project
  ----------------------- ----------------------- -----------------------
  `Ticker`                NSE-listed stock symbol Map a headline to a
                                                  stock

  `Headline`              Financial news headline **Main VADER input
                                                  text**

  `Date`                  Headline publication    Select recent headlines
                          date                    and order them

  `Close`                 Closing stock price on  Context/optional
                          the headline date       validation; not a VADER
                                                  input

  `1d_return`             Return after one        Optional post-event
                          trading day             analysis; not a VADER
                                                  input

  `3d_return`             Return after three      Optional post-event
                          trading days            analysis; not a VADER
                                                  input

  `5d_return`             Return after five       Optional post-event
                          trading days            analysis; not a VADER
                                                  input

  `sentiment`             Positive, neutral or    Compare VADER's
                          negative label          predicted label against
                                                  reference labels

  `source_score`          FinancialBERT model     Reference field only;
                          confidence score,       do not use as VADER
                          according to repository input
                          description             

  `max_abs_return`        Maximum absolute return Optional post-event
                          across the supplied     analysis; not a VADER
                          horizons                input
  -----------------------------------------------------------------------

**Important:** VADER analyses the `Headline` text. It does not train on
`sentiment`, `source_score` or future-return columns. Those columns can
be reserved for checking/analysing the output. Avoid using them as model
input because that would leak the reference label or post-publication
market information.

**Historical versus live use:** This dataset is suitable for
development, testing and historical sentiment analysis. If the
application must show the latest headlines every day, connect a
permitted current news API/feed and map its records to the same fields
(`Ticker`, `Headline`, `Date`). A static downloaded dataset cannot
provide new headlines after its last update.

------------------------------------------------------------------------

# 2. Output 1 --- 10-day volatility forecast

## Selected model: GARCH(1,1)

**Why GARCH(1,1):** This is the volatility model explicitly selected in
SDD Section 4.5. It models changes in return variance over time and is
suitable for forecasting volatility rather than attempting to predict
the exact future stock price.

### Dataset

Use Dataset A --- TejHQ Indian Markets, specifically: - Raw Bhavcopy
data for symbol and date identification. - Back-adjusted price data
(`prices_adjusted/`) for adjusted closing prices. - Corporate-action
data for audit and validation where needed.

### Exact dataset columns to use

  -------------------------------------------------------------------------
  Column                    Required?               Purpose
  ------------------------- ----------------------- -----------------------
  `date`                    Yes                     Chronological ordering

  `symbol`                  Yes                     Select the stock

  `series`                  Yes                     Filter to the desired
                                                    equity series, normally
                                                    NSE `EQ`

  `adj_close`               Yes, preferred          Calculate adjusted
                                                    daily returns

  `close`                   Fallback/reference      Use only if adjusted
                                                    close is unavailable,
                                                    with corporate-action
                                                    limitations documented

  `adj_factor_cumulative`   Validation              Check how the adjusted
                                                    close was derived

  `ex_date`, `type`,        Validation when         Review corporate
  `cash_amount`,            relevant                actions that may affect
  `ratio_num`, `ratio_den`                          the price series
  -------------------------------------------------------------------------

Do not use `open`, `high`, `low` or `volume` as direct inputs to the
basic GARCH(1,1) design in the SDD. The specified input is the
historical daily return series.

### Derived column required

Create this column from `adj_close`:

``` text
Daily_Return = (adj_close_today / adj_close_previous_day) - 1
```

A log-return series can also be used if it is applied consistently:

``` text
Log_Return = ln(adj_close_today / adj_close_previous_day)
```

Use one return convention consistently for fitting, forecasting and
evaluation.

### Model input

-   One selected stock's historical daily return series.
-   Last 2--3 years of daily observations, as specified in the SDD.
-   The SDD specifies a minimum-history check of 250 observations.

### Processing steps

1.  Filter the dataset for one stock symbol and the selected equity
    series.
2.  Sort records by `date`.
3.  Use `adj_close` to calculate daily returns.
4.  Check missing dates, missing values and corporate-action handling.
5.  Fit a GARCH(1,1) model using the `arch` Python library.
6.  Forecast conditional variance for the next 10 trading days.
7.  Convert the forecast variance into volatility and present the
    forecast horizon clearly.

### Expected application output

`<box>`{=html} **10-day volatility forecast**

-   Selected stock: `RELIANCE`
-   Forecast horizon: `Next 10 trading days`
-   Forecast volatility: `Model-generated value`
-   Forecast date: `Latest available trading date` `</box>`{=html}

The numerical value above is a display template, not a real prediction.

Also retain: - Model run timestamp. - Historical data window. - Model
version/parameters. - Data cutoff date. - Comparison with subsequently
observed 30-day realized volatility, as described in the SDD. - RMSE or
another defined forecast error metric during evaluation. - An
insufficient-history warning when the required history is not available.

**Note on volatility units:** Decide whether the displayed forecast is
daily, 10-day cumulative or annualized volatility. Label the unit and
calculation convention in the UI. Do not display an unlabeled
percentage.

------------------------------------------------------------------------

# 3. Output 2 --- anomaly dates, anomaly score and unusual movement indicators

## Selected model: Isolation Forest

**Why Isolation Forest:** This is the anomaly-detection model explicitly
specified in SDD Section 4.5. It identifies observations that are
unusual relative to the historical pattern of returns and trading
volume.

### Dataset

Use Dataset A --- TejHQ Indian Markets, specifically the raw Bhavcopy
OHLCV data.

### Exact dataset columns to use

  -----------------------------------------------------------------------
  Column                  Required?               Purpose
  ----------------------- ----------------------- -----------------------
  `date`                  Yes                     Report the date of the
                                                  anomaly

  `symbol`                Yes                     Identify the stock

  `series`                Yes                     Filter the intended
                                                  equity series

  `open`                  Recommended             Calculate opening gap
                                                  indicator

  `high`                  Recommended             Calculate intraday
                                                  range indicator

  `low`                   Recommended             Calculate intraday
                                                  range indicator

  `close`                 Yes, unless a           Calculate daily return
                          consistent              
                          adjusted-return series  
                          is used                 

  `prev_close`            Yes, if available       Calculate daily return
                                                  and opening gap

  `volume`                Yes                     Calculate volume
                                                  z-score

  `turnover`              Optional                Additional context for
                                                  unusual activity

  `trades`                Optional                Additional context for
                                                  unusual activity
  -----------------------------------------------------------------------

### Derived columns required

The SDD specifies two core model features:

**1. Daily return**

``` text
Daily_Return = (close_today / prev_close) - 1
```

Use a consistently adjusted price series if the application needs
returns that account for corporate actions. If raw close and previous
close are used, corporate-action dates must be checked so a split or
similar event is not incorrectly flagged as an anomaly.

**2. Volume z-score**

``` text
Volume_ZScore =
(volume_today - rolling_mean_volume) / rolling_std_volume
```

Calculate the rolling mean and standard deviation using past
observations only. Choose and document a rolling window (for example, 20
prior trading sessions).

### Additional unusual-movement indicators for display

These indicators provide understandable context for each detected
anomaly. They can be calculated from the same OHLCV dataset.

  ------------------------------------------------------------------------------------------
  Indicator               Calculation                                Meaning
  ----------------------- ------------------------------------------ -----------------------
  `Daily_Return_Pct`      `Daily_Return * 100`                       Percentage price
                                                                     movement

  `Volume_ZScore`         Rolling z-score of volume                  How unusual today's
                                                                     volume is relative to
                                                                     recent volume

  `Intraday_Range_Pct`    `(high - low) / prev_close * 100`          Size of the day's
                                                                     high-low movement

  `Opening_Gap_Pct`       `(open - prev_close) / prev_close * 100`   Difference between
                                                                     today's open and
                                                                     previous close

  `Turnover`              Source `turnover` value                    Traded value for
                                                                     context

  `Trades`                Source `trades` value                      Number of trades for
                                                                     context
  ------------------------------------------------------------------------------------------

The SDD's core Isolation Forest inputs remain **Daily_Return and
Volume_ZScore**. The other indicators are included to explain the
unusual movement to the user; they are not required inputs to the
initial model.

### Model input

Each model row represents one stock on one trading date:

``` text
[Daily_Return, Volume_ZScore]
```

Use the SDD's initial Isolation Forest contamination setting of **0.02
(2%)**. This is a model configuration, not proof that 2% of observations
are genuine market events.

### Processing steps

1.  Select a stock and sort its OHLCV observations by date.
2.  Calculate daily return.
3.  Calculate rolling volume z-score.
4.  Remove or handle rows where the features cannot be calculated
    reliably.
5.  Fit Isolation Forest on the historical feature rows.
6.  Run anomaly detection for each date.
7.  Join the flagged dates with the OHLCV-derived movement indicators
    for explanation.

### Expected application output

  Output field           Description
  ---------------------- -----------------------------------------------
  `symbol`               Stock name/symbol
  `anomaly_date`         Date flagged by the model
  `is_anomaly`           Whether the model flags the observation
  `anomaly_score`        Model score used to rank unusual observations
  `daily_return_pct`     Price movement on that date
  `volume_zscore`        Unusual volume indicator
  `intraday_range_pct`   High-low movement indicator
  `opening_gap_pct`      Opening gap indicator
  `turnover`             Traded value, if available

### How to interpret the anomaly score

Isolation Forest implementations expose scores such as `score_samples`
and `decision_function`. In scikit-learn, lower `score_samples` values
indicate more abnormal observations; negative `decision_function` values
are classified as outliers under the selected threshold.

-   Do not describe the raw Isolation Forest score as a probability.
-   Keep the score definition consistent in the API and UI.
-   You may rank flagged observations from most unusual to least
    unusual.
-   If you create a user-friendly severity label such as Low / Medium /
    High, define it using documented score thresholds or percentiles. Do
    not present it as a calibrated probability.

**Example UI wording:** "Unusual activity detected for \[symbol\] on
\[date\]. Daily return: X%; volume z-score: Y; anomaly score: Z."

An anomaly does not automatically mean fraud, manipulation, negative
news or a buy/sell signal.

------------------------------------------------------------------------

# 4. Output 3 --- sentiment score between -1 and +1

## Selected model: VADER Sentiment Analyzer

**Why VADER:** The SDD explicitly specifies VADER as the lightweight
news-sentiment method. It returns a normalized compound score between -1
and +1 and does not require model training.

### Dataset

Use Dataset B --- Indian Financial News Sentiment & Stock Movement
Dataset.

### Exact dataset columns to use

  -----------------------------------------------------------------------
  Column                  Required?               Purpose
  ----------------------- ----------------------- -----------------------
  `Ticker`                Yes                     Map the news headline
                                                  to a stock

  `Headline`              Yes                     Main text input to
                                                  VADER

  `Date`                  Yes                     Select recent headlines
                                                  and order them

  `sentiment`             Optional, for           Compare VADER's output
                          evaluation only         label against the
                                                  reference label

  `source_score`          No, reference only      Do not use as VADER
                                                  input

  `Close`                 No, context only        Not needed to calculate
                                                  text sentiment

  `1d_return`             No, context only        Future market response;
                                                  must not be a VADER
                                                  input

  `3d_return`             No, context only        Future market response;
                                                  must not be a VADER
                                                  input

  `5d_return`             No, context only        Future market response;
                                                  must not be a VADER
                                                  input

  `max_abs_return`        No, context only        Post-headline market
                                                  movement; must not be a
                                                  VADER input
  -----------------------------------------------------------------------

### Model input

The SDD specifies the **latest 10 headlines per stock symbol**.

The input to VADER is only the headline text:

``` text
Headline = "Company reports stronger quarterly earnings"
```

Ticker and date are used to group and select the headlines, not as text
features for VADER.

### Processing steps

1.  Load the news dataset.
2.  Filter headlines for the selected ticker.
3.  Sort by `Date` and select the latest 10 headlines.
4.  Remove duplicate headlines.
5.  Apply VADER to each headline.
6.  Extract the `compound` score from each headline.
7.  Aggregate the latest headline scores for the selected stock.
8.  If no headlines are available, show "Sentiment unavailable" rather
    than inventing a neutral score.

### Expected application output

VADER returns a compound score in the range **-1 to +1**:

    Compound score Suggested label
  ---------------- -----------------
      Closer to -1 Negative
          Around 0 Neutral
      Closer to +1 Positive

VADER's commonly used compound thresholds are: - Score \>= 0.05:
Positive. - Score \<= -0.05: Negative. - Between -0.05 and +0.05:
Neutral.

### Aggregated score for a stock

For the initial implementation, calculate the simple average of the
compound scores for the latest 10 headlines:

``` text
Stock_Sentiment_Score = Mean(compound_score of latest 10 headlines)
```

The result remains between -1 and +1.

Also show: - Stock ticker. - Aggregated sentiment score. - Positive /
Neutral / Negative label. - Number of headlines analysed. - Date of the
latest headline.

**Example UI wording:** "News sentiment for \[symbol\]: +0.42
(Positive), based on 8 recent headlines."

This example is illustrative only, not a measured result.

### Important limitation

The historical dataset supports development and testing. For current
sentiment in the live application, you need a permitted news feed/API
that provides fresh headlines. A static CSV will not update itself.

VADER is lexicon/rule based. It is not trained on the dataset's
`sentiment` column. Use the manually reviewed sentiment labels only to
evaluate how well VADER's predicted labels agree with the reference
labels.

------------------------------------------------------------------------

# 5. Final input-column mapping

This is the main implementation checklist for preparing the three model
pipelines.

  --------------------------------------------------------------------------
  Dataset column    GARCH(1,1) ---       Isolation Forest  VADER ---
                    10-day volatility    --- anomalies     sentiment
  ----------------- -------------------- ----------------- -----------------
  Market `date`     Required             Required          ---

  Market `symbol`   Required             Required          ---

  Market `series`   Filter/validate      Filter/validate   ---

  Market            Required/preferred   Use for adjusted  ---
  `adj_close`                            return if         
                                         available         

  Market `close`    Fallback/reference   Return            ---
                                         calculation if    
                                         appropriate       

  Market            Not required if      Required for      ---
  `prev_close`      return calculated    raw-close         
                    from adjusted close  return/gap        
                                         calculation       

  Market `open`     No                   For opening-gap   ---
                                         indicator         

  Market `high`     No                   For               ---
                                         intraday-range    
                                         indicator         

  Market `low`      No                   For               ---
                                         intraday-range    
                                         indicator         

  Market `volume`   No                   Required          ---

  Market `turnover` No                   Optional output   ---
                                         context           

  Market `trades`   No                   Optional output   ---
                                         context           

  News `Ticker`     ---                  ---               Required for
                                                           stock mapping

  News `Headline`   ---                  ---               Required model
                                                           input

  News `Date`       ---                  ---               Required for
                                                           latest-headline
                                                           selection

  News `sentiment`  ---                  ---               Evaluation only

  News              ---                  ---               Reference only;
  `source_score`                                           not input

  News future       ---                  ---               Do not use as
  return fields                                            input
  --------------------------------------------------------------------------

------------------------------------------------------------------------

# 6. Data preparation rules

Apply these rules before running the models:

1.  Parse `date`/`Date` into a consistent date format.
2.  Sort market observations by `symbol` and `date`.
3.  Filter to the intended equity series. For an initial NSE
    implementation, use the appropriate `EQ` series.
4.  Check duplicate symbol/date records before removing anything.
5.  Check missing, zero or invalid prices and volumes.
6.  Use `adj_close` for return calculations when available.
7.  If adjusted prices are not available, inspect corporate actions
    before calculating returns. A split or bonus issue can otherwise
    appear as a false large price movement.
8.  Do not forward-fill volume.
9.  Do not calculate a rolling z-score using future observations.
10. For GARCH, enforce the SDD's minimum history check of 250
    observations and preferred 2--3 years of daily returns.
11. For news, deduplicate headlines and check publication dates before
    selecting the latest 10 per ticker.
12. Keep dataset source, retrieval date, symbol, date range and
    preprocessing version for reproducibility.

------------------------------------------------------------------------

# 7. Model evaluation and validation

  -----------------------------------------------------------------------
  Model                               Validation approach
  ----------------------------------- -----------------------------------
  GARCH(1,1)                          Compare forecast volatility with
                                      subsequently observed realized
                                      volatility; report RMSE. Use
                                      chronological or walk-forward
                                      evaluation.

  Isolation Forest                    Review flagged dates against
                                      price/volume charts and known
                                      events. If manually labelled
                                      anomalies are available, report
                                      precision and recall.

  VADER                               Compare predicted sentiment labels
                                      with the dataset's manually
                                      reviewed sentiment labels. Report
                                      accuracy, macro-F1 and a confusion
                                      matrix where the label coverage is
                                      sufficient.
  -----------------------------------------------------------------------

For volatility forecasting, do not randomly shuffle time-series
observations. Use chronological or walk-forward splits, as required by
the SRS. Store the training cutoff, forecast horizon, model version, run
timestamp and feature-date cutoff.

------------------------------------------------------------------------

# 8. Final project implementation plan

  ------------------------------------------------------------------------
                          Step Task                  Result
  ---------------------------- --------------------- ---------------------
                             1 Download/inspect      Historical NSE/BSE
                               TejHQ Indian Markets  OHLCV and adjusted
                               dataset               price data

                             2 Prepare price data    Clean per-stock time
                               and corporate-action  series
                               checks                

                             3 Calculate adjusted    Input series for
                               daily returns         GARCH

                             4 Fit GARCH(1,1) and    **10-day volatility
                               forecast next 10      forecast**
                               trading days          

                             5 Calculate daily       Input features for
                               return and volume     Isolation Forest
                               z-score               

                             6 Run Isolation Forest  **Anomaly dates,
                               and join flagged rows anomaly score and
                               with OHLCV indicators unusual movement
                                                     indicators**

                             7 Download/inspect      Headline records
                               Indian financial news mapped to tickers
                               headlines             

                             8 Apply VADER to the    **Sentiment score
                               latest 10 headlines   between -1 and +1**
                               per ticker and        
                               aggregate compound    
                               scores                

                             9 Integrate all three   Three requested
                               outputs into the      outputs with dates,
                               SPRPA dashboard       labels and data
                                                     provenance
  ------------------------------------------------------------------------

------------------------------------------------------------------------

# 9. Final recommendation

Use the following exact combination for the requested capstone outputs:

  --------------------------------------------------------------------------
  Output            Dataset           Columns used         One selected
                                                           model
  ----------------- ----------------- -------------------- -----------------
  10-day volatility TejHQ Indian      `date`, `symbol`,    **GARCH(1,1)**
  forecast          Markets ---       `series`,            
                    back-adjusted     `adj_close` →        
                    prices            derived daily        
                                      returns              

  Anomaly dates,    TejHQ Indian      `date`, `symbol`,    **Isolation
  anomaly score and Markets --- raw   `series`, `close`,   Forest**
  unusual movement  OHLCV             `prev_close`,        
  indicators                          `volume`; `open`,    
                                      `high`, `low`,       
                                      `turnover`, `trades` 
                                      for                  
                                      indicators/context   

  Sentiment score   Indian Financial  `Ticker`,            **VADER**
  between -1 and +1 News Sentiment &  `Headline`, `Date`;  
                    Stock Movement    `sentiment` only for 
                    Dataset           evaluation           
  --------------------------------------------------------------------------

This keeps the implementation focused on three outputs and three models.
The first two outputs use one Indian stock-market data source; sentiment
uses a separate Indian financial-news dataset. Do not try to derive news
sentiment from OHLCV columns, and do not use future return columns as
VADER inputs.

## Source references

-   [TejHQ Indian Markets
    dataset](https://huggingface.co/datasets/tejhq/indian-markets)
-   [TejHQ Tej-Bazaar source repository and documented data
    schema](https://github.com/tejhq/tej-bazaar)
-   [Indian Financial News Sentiment & Stock Movement
    Dataset](https://github.com/Sid-istic/financial-news-sentiment-dataset-)
-   [NSE official reports](https://www.nseindia.in/all-reports) ---
    optional cross-check for sample market records.
