#!/bin/bash
file=$1
name=`basename $file .wav`
dir=`dirname $0`
lame --resample 44100 $file root/audio/$name.mp3
oggenc --resample 44100 $file -o root/audio/$name.ogg
$dir/create_spectrogram.sh $file $name root/spectrogram/
../asr/run_asr.sh ../node/$file
python $dir/generate_json.py ../asr/latp5/latMEDIA1_2010_JUIN.$name/*/*saus \
    | iconv -f latin1 -t utf8 > $file.json
