package domain

import "time"

type TriState int

const (
	TriStateAbsent TriState = iota
	TriStateFalse
	TriStateTrue
)

type AnimeDay struct {
	Day   string
	Order float64
}

type Anime struct {
	ID               string
	Nombre           string
	NroCapVisto      float64
	Dias             []AnimeDay
	ActivoState      TriState
	FechaEstreno     *time.Time
	FechaUltCapVisto *time.Time
}
