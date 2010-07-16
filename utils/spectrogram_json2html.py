import sys

sys.stdout.write('<html><body style="margin:0px;padding:0x;background:white;"><table border="0" cellspacing="0" cellpadding="0"><tr>')
for line in sys.stdin:
    if line.find("spectrogram") != -1:
        sys.stdout.write('<td><img src="%s"></td>' % line.replace("spectrograms/root/spectrogram//", "").split('"')[1])
print "</tr><table></body></html>"
