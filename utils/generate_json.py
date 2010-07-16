import sys, re, commands
#latMEDIA1_2010_JUIN/1016.r/1016.r-21.17-29.45-F2_M-S1016saus
dialogs = {}
for filename in sys.argv[1:]:
    dialog = filename.split('/')[-2].split(".")[0]
    if dialog not in dialogs: dialogs[dialog] = []
    dialogs[dialog].append([filename, float(filename.split('-')[-4])])

print '['
for dialog in sorted(dialogs, lambda x, y: cmp(int(x), int(y))):
    dialogs[dialog].sort(lambda x, y: cmp(x[1], y[1]))
    print '{'
    print '"name":"%s",' % dialog
    print '"original_audio":"uploads/%s.wav",' % dialog
    print '"asr_status":"processed",'
    print '"asr_log":"none",'
    print '"group":"media1-test",'
    print '"transcript_status":"unmodified",'
    #print '"uploaded":"offline",' # generated automatically by server
    print '"shown":"true",'
    print '"audio":["audio/%s.ogg", "audio/%s.mp3"],' % (dialog, dialog)
    png_files = [[x, int(x.split('-')[-1].split('.')[0])] 
        for x in commands.getoutput("find root/spectrogram/%s -name '*.png' | sed 's/root\///'" % dialog).split('\n')]
    png_files.sort(lambda x, y: cmp(x[1], y[1]))
    print '"spectrograms":["' + '", "'.join([x[0] for x in png_files]) + '"],'
    print '"segments":['
    for filename in [x[0] for x in dialogs[dialog]]:
        speaker = 'unknown'
        start = 0
        end = 0
        name = filename
        result = re.search(r'([^/]+)-(\d+\.\d+)-(\d+\.\d+)-([^/]+)saus$', filename)
        if result:
            start = float(result.group(2))
            end = float(result.group(3))
            speaker = result.group(4)
        print '{'
        print '"name":"%s",' % filename
        print '"dialog":"%s",' % dialog
        print '"start":"%.2f",' % start
        print '"end":"%.2f",' % end
        print '"speaker":"%s",' % speaker
        print '"modified":"unmodified",'
        print '"wordlists":['
        words = []
        text = []
        for line in open(filename):
            tokens = line.split()
            if len(tokens) == 1:
                pass
            elif len(tokens) == 4:
                if not(tokens[2].startswith('<') or tokens[2].startswith('[')):
                    words.append(tokens)
            elif len(tokens) == 5:
                if len(words) > 0:
                    words.sort(lambda x, y: cmp(float(y[3]), float(x[3])))
                    if words[0][2] != 'eps':
                        text.append(words[0][2])
                        print '    {'
                        print '    "start":%.2f,' % (float(tokens[3])/100 + start)
                        print '    "end":%.2f,' % (float(tokens[4])/100 + start)
                        print '    "words":["' + '", "'.join([x[2].replace('"', '\\"') for x in words if x[2] != 'eps']) + '"],'
                        print '    "selected":0'
                        print '    },' # warning: we generate invalid json that has to be fixed
                    words = []
            else:
                print >>stderr, 'ERROR: unexpected line "%s"' % line.strip()
                sys.exit(1)

        print '],'
        print '"text":"%s",' % ' '.join(text).replace('"', '\\"')
        print '},' # warning: we generate invalid json that has to be fixed
    print ']},'
print ']'
