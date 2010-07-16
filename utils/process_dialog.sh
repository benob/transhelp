#!/bin/bash
file=$1
dir=`dirname $0`
lame --resample 44100 $file root/audio/`basename $file .wav`.mp3
oggenc --resample 44100 $file -o root/audio/`basename $file .wav`.ogg
$dir/create_spectrogram.sh $file `basename $file .wav` root/spectrogram/
../asr/run_asr.sh ../node/$file
