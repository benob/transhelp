#!/bin/bash
dir=`dirname $0`
if [ $# != 3 ]
then
    echo "USAGE: $0 <wav_input> <show_name> <output_dir>" >&2
    exit 1
fi
tmp=tmp.$$
audio=$1
output=$3/$2
sox $audio -r 16000 -c 1 $tmp.r.wav mixer -r
sox $audio -r 16000 -c 1 $tmp.l.wav mixer -l
samples=`soxi -s $tmp.r.wav`
width=`expr $samples / 160`
echo $width
python $dir/svt.py -p 2 -f 1024 -m 3800 -w $width -h 64 $tmp.r.wav -s $tmp.r.png
python $dir/svt.py -p 2 -f 1024 -m 3800 -w $width -h 64 $tmp.l.wav -s $tmp.l.png
montage -geometry +0+0 -tile 1x2 $tmp.r.png $tmp.l.png -colors 64 -strip $tmp.png
mkdir -p $output
convert $tmp.png -crop 1024x0 +repage +adjoin $output/$2-%d.png
find $output -name '*.png' | sort -t- -k2 -n \
    | awk 'BEGIN{print "{\"images\":["}{print "\"'$3'" $0 "\","}END{print "]}"}' \
    | python $dir/spectrogram_json2html.py > $output.html
rm $tmp.r.wav $tmp.l.wav $tmp.r.png $tmp.l.png $tmp.png
