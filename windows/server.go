package main

import (
	"embed"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"strconv"
	"time"
)

// The game, built by android/prepare-web.mjs into ./www, is packed into the program.
//
//go:embed all:www
var files embed.FS

// The game keeps its saves (career, mods, settings) per web address, so it is always served on the same port.
const port = 47613

func init() {
	// Windows reads file types from the registry, where .js or .css can be wrong; set the ones the game uses.
	for ext, typ := range map[string]string{
		".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
		".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
		".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
		".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
	} {
		_ = mime.AddExtensionType(ext, typ)
	}
}

// serve starts the game's local web server and returns its address. running is true when another copy of the
// game already holds the port (its server is then the one to use).
func serve() (url string, running bool, err error) {
	www, err := fs.Sub(files, "www")
	if err != nil {
		return "", false, err
	}
	mux := http.NewServeMux()
	static := http.FileServer(http.FS(www))
	mux.HandleFunc("/__sixthfront", func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "sixthfront") })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store") // a newer version of the program never shows old files
		static.ServeHTTP(w, r)
	})

	ln, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		if ours(port) {
			return "http://127.0.0.1:" + strconv.Itoa(port) + "/", true, nil
		}
		// Something else has the port: play anyway on a free one (saves from the usual port are not seen then).
		if ln, err = net.Listen("tcp", "127.0.0.1:0"); err != nil {
			return "", false, err
		}
	}
	go func() { _ = http.Serve(ln, mux) }()
	return "http://" + ln.Addr().String() + "/", false, nil
}

// ours reports whether the server on the port is this game's.
func ours(port int) bool {
	c := http.Client{Timeout: 2 * time.Second}
	res, err := c.Get("http://127.0.0.1:" + strconv.Itoa(port) + "/__sixthfront")
	if err != nil {
		return false
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 64))
	return string(b) == "sixthfront"
}
