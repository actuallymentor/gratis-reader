# OpenAI model selection

Checked 2026-09-08. The reader uses OpenRouter; catalog presence does not guarantee access for every API key.

**Keep GPT-4o Mini as the default.** GPT-5.6 Luna is the most promising newer budget model to evaluate, but published documentation does not establish better translation quality for this reader. Turbo Mode already increases request volume. No paid model comparison was run.

Prices are USD per million uncached input/output tokens, excluding additional reasoning tokens and provider-specific charges.

| Model | Input | Output | Fit for this reader |
| --- | ---: | ---: | --- |
| GPT-4o Mini | $0.15 | $0.60 | Current low-cost baseline |
| GPT-5 nano | $0.05 | $0.40 | Cheap token rates; reasoning can increase cost and latency |
| GPT-5 mini | $0.25 | $2.00 | Higher output cost |
| GPT-5 / 5.1 | $1.25 | $10.00 | Too large a default cost increase |
| GPT-5.2 | $1.75 | $14.00 | Too large a default cost increase |
| GPT-5.4 nano / mini | $0.20 / $0.75 | $1.25 / $4.50 | Luna has lower published rates |
| GPT-5.4 / 5.5 | $2.50 / $5.00 | $15.00 / $30.00 | Flagship pricing |
| GPT-5.6 Luna | $0.20 | $1.20 | Best newer candidate for a measured comparison |
| GPT-5.6 Terra | $2.00 | $12.00 | Substantially more expensive |
| GPT-5.6 Sol | $4.00 | $20.00 | Official price; OpenRouter currently lists $2/$10 |
| GPT-6 Astra | $10.00 | $50.00 | Excessive cost for background dictionary lookups |

At 1,000 input and 2,000 output tokens, Luna costs $0.00260 versus $0.00135 for GPT-4o Mini: **1.93×**, before reasoning or cache effects. Actual word lookups have a different input/output ratio. GPT-5.3's coding-specialized model is not a useful translation default.

## Before changing defaults

- Compare contextual meanings, idioms, CEFR adaptation, and languages with different word boundaries using representative book excerpts.
- Measure completion quality, latency, and actual billed usage. A newer model name alone does not establish better results.
- OpenRouter lists GPT-5.6 Luna/Terra/Sol and GPT-6 Astra. Check account access with real inference before adopting them.
- Luna supports reasoning `none` but defaults to `medium`. Disable reasoning explicitly for a cost/latency comparison; Astra has no `none` setting.
- OpenRouter's current GPT-5/6 catalog entries omit `temperature` from supported parameters. A migration must adjust request parameters and cost estimates, not only replace the model ID.
- Preserve users' explicit model choices when introducing any future default.

## Sources

- [OpenRouter live model catalog and prices](https://openrouter.ai/api/v1/models)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models/all)
- [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano), [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini), [GPT-5](https://developers.openai.com/api/docs/models/gpt-5), [GPT-5.1](https://developers.openai.com/api/docs/models/gpt-5.1), [GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2)
- [GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
