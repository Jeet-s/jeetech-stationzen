set -e
cd "$(dirname "$0")"
W=../../..
(cd $W && npx expo export:embed --platform android --dev false --bytecode --entry-file index.js --bundle-output .agf/tmp/dev/index.android.bundle --assets-dest .agf/tmp/dev/res >/dev/null 2>&1)
BT=$(ls -d ~/Library/Android/sdk/build-tools/* | tail -1)
cp $W/android/app/build/outputs/apk/release/app-release.apk base.apk
zip -q -d base.apk 'META-INF/*'
cp index.android.bundle assets/
zip -q -0 base.apk assets/index.android.bundle
$BT/zipalign -f 4 base.apk aligned.apk
$BT/apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android --key-pass pass:android --out test.apk aligned.apk
find out -type f -delete
echo built
