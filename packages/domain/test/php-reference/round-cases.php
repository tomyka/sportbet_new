<?php

// What PHP 8.4's round() does on the inputs sportbet feeds it, written to
// round-cases.json for packages/domain/src/points/php-round.test.ts.
//
// Regenerate from the repository root (Git Bash):
//   MSYS_NO_PATHCONV=1 docker run --rm \
//     -v "$(pwd -W)/packages/domain/test/php-reference:/ref" -w /ref \
//     php:8.4-cli php round-cases.php > packages/domain/test/php-reference/round-cases.json
//
// Nothing about PHP's rounding is assumed: the TypeScript port is compared
// with every line this script prints.

declare(strict_types=1);

const MAX_VOTERS = 100;
const HALF_WAY_STEPS = 2000;

// The formula and the two roundings, exactly as sportbet has them
// (app/Support/CrowdOdds.php, app/Support/StandingPointsRow.php).
function crowdOdds(float $total, float $count): float
{
    return log($total / $count, 2);
}

function gameOdds(float $odds): float
{
    return round(round($odds, 4), 2);
}

function standingsOdds(float $odds): float
{
    return round($odds, 4);
}

$round = [];
// Half-way values at two and four places, where a binary double sits just
// below or just above the decimal it was written as (0.585, 0.285, 1.005).
foreach ([2, 4] as $places) {
    $scale = 10 ** $places;
    for ($n = 0; $n < HALF_WAY_STEPS; $n++) {
        $value = ($n + 0.5) / $scale;
        $round[] = ['value' => $value, 'places' => $places, 'result' => round($value, $places)];
        $round[] = ['value' => -$value, 'places' => $places, 'result' => round(-$value, $places)];
    }
}
// The four-place results sportbet rounds a second time, to two places.
for ($n = 0; $n <= 99999; $n += 11) {
    $value = $n / 10000;
    $round[] = ['value' => $value, 'places' => 2, 'result' => round($value, 2)];
}

$odds = [];
for ($total = 1; $total <= MAX_VOTERS; $total++) {
    // count 0.5 is the contrarian odds of an outcome nobody picked (CO-3).
    foreach (array_merge([0.5], range(1, $total)) as $count) {
        $raw = crowdOdds((float) $total, (float) $count);
        $odds[] = [
            'total' => $total,
            'count' => $count,
            'game' => gameOdds($raw),
            'standings' => standingsOdds($raw),
        ];
    }
}

$lines = static fn (array $cases): string => implode(",\n", array_map(
    static fn (array $case): string => json_encode($case, JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR),
    $cases,
));

echo "{\n\"php\": ".json_encode(PHP_VERSION).",\n";
echo "\"round\": [\n".$lines($round)."\n],\n";
echo "\"odds\": [\n".$lines($odds)."\n]\n}\n";
