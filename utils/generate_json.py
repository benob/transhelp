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
    # note that this is only used when importing batch asr output
    print '"original_audio":"%s",' % commands.getoutput("find /lium/parolee/unsaved/corpus/MEDIA.good/MEDIA1FR_0[012]/MEDIA1FR/DATA/audio -name %s.wav" % dialog).split("\n")[0]
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
            speaker = result.group(4) + "-" + result.group(1)
        print '{'
        print '"name":"%s",' % filename
        print '"dialog":"%s",' % dialog
        print '"segment_start":"%.2f",' % start
        print '"segment_end":"%.2f",' % end
        print '"speaker":"%s",' % speaker
        print '"modified":"unmodified",'
        print '"wordlists":['
        words = []
        text = []
        min_start = None
        max_end = None
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
                        wordlist_start = float(tokens[3])/100 + start
                        wordlist_end = float(tokens[4])/100 + start
                        if min_start == None or min_start > wordlist_start: min_start = wordlist_start
                        if max_end == None or max_end < wordlist_end: max_end = wordlist_end
                        print '    {'
                        print '    "start":%.2f,' % wordlist_start
                        print '    "end":%.2f,' % wordlist_end
                        print '    "words":["' + '", "'.join([x[2].replace('"', '\\"') for x in words if x[2] != 'eps']) + '"],'
                        print '    "selected":0'
                        print '    },' # warning: we generate invalid json that has to be fixed
                    words = []
            else:
                print >>stderr, 'ERROR: unexpected line "%s"' % line.strip()
                sys.exit(1)

        if min_start = None: min_start = start
        if max_end = None: max_end = end
        print '"start":"%.2f",' % min_start
        print '"end":"%.2f",' % max_end
        print '],'
        print '"text":"%s",' % ' '.join(text).replace('"', '\\"')
        print '},' # warning: we generate invalid json that has to be fixed
    print ']},'
print ']'
