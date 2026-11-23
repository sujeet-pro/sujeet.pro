A brand site with 200 vanity URLs doesn't need a redirect service. Zero-byte S3 redirect objects behind CloudFront are the whole system.

Start with a config file. Earn every component after that.

I wrote up a URL redirection service as six levels, each unlocked by a concrete trigger: marketing wants self-service, APAC p95 slips, a bot scan turns into a 404 storm, growth asks for attribution, 40 brands need pattern rules and Region failover. Every level names what it deliberately defers.

The finding that reshaped the design: a Bloom filter for 10M slugs at a 1% false-positive rate is about 12 MB. CloudFront KeyValueStore caps a value at 1 KB and a whole store at 5 MB; a CloudFront Function gets 10 KB of code and 2 MB of memory. So the filter guards DynamoDB from inside the regional service, and the edge caches 404s.

Two more from the cost model: CloudFront request fees are 55–61% of the bill from L2 up, and Firehose rounds every record up to 5 KB, so a raw click line bills at 20× its size.

AWS list prices for us-east-1, every limit linked to the docs, and a lab where you inject failures level by level.

https://sujeet.pro/design-url-redirection-service/

#SystemDesign #AWS
