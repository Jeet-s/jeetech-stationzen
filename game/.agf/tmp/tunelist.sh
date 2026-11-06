#!/bin/bash
# usage: tunelist.sh OUTFILE n1 n2 ...
out=$1; shift
echo '{}' > $out
for n in "$@"; do OUT=$out npx tsx scripts/tune-levels.ts $n $n; done
