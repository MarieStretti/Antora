# TP CI/CD Antora

[![Build Status](https://travis-ci.com/MarieStretti/Antora.svg?branch=master)](https://travis-ci.com/MarieStretti/Antora)

* Les résultats des builds se trouvent ici : https://travis-ci.com/MarieStretti/Antora/
* La documentation générée est au lien suivant : https://mariestretti.github.io/Antora/

## Objectifs du TP

L'objectif principal de ce TP est de mettre en oeuvre de la livraison continue sur un projet. Pour cela, il fallait créer un pipeline avec trois étapes : Construire, Tests et Déployer.
L’intégration continue devra être un Pipeline effectuant :
3 étapes “de base”: Construire, Tests et Déployer:
L’étape “Construire” devra générer, en plus de l’application, un site web statique de documentation (type “maven site”)
L’étape “Déployer” devra déployer le site web statique pour chaque branche


## Outil de CI/CD utilisé

Travis CI

# Stage Setup

Ce stage exécute trois commandes :
* `yarn install` : installation des dépendances yarn
* `npm install gulp-cli` : installation de gulp, qui contrairement à npm et yarn, n'est pas intégré dans Travis
* `./node_modules/.bin/jsdoc scripts/*.js -d docs` : génération de la documentation (i.e de tous les fichiers .js du dossier script) dans le dossier docs (lu par défaut par GitHub comme dossier de documentation)

## Stage Verify

Ce stage a pour but de faire passer les commandes de test.
Deux commandes ont été utilisées :
* `gulp lint` : correspond aux tests unitaires
* `gulp test` : correspond aux tests d'intégration

### Tests parallèles

Un des points à remplir était d'effectuer des tests d'intégration ou d'acceptance sur deux plateformes différentes. Pour ce projet, les tests d'intégration sont parallélisés sous deux versions de node js, node_js 10 et node_js 12. Cette mise en parallèle des tests se fait grâce à une matrice qui lie les stages et les versions de node.

## Stage Deploy

Ce stage consiste à déployer le site web statique pour chaque branche, c'est-à-dire la documentation générée par Antora. Ce déploiement se fait sur la page GitHub (https://mariestretti.github.io/Antora/), par l'intermédiaire de la branche `gh-pages`.

## Pull/Merge request
Etant donné que Travis se met à builder la pipeline automatiquement une fois un push réalisé, il est essentiel de faire en sorte qu'un contributeur ne puisse pull ou merge seulement si le build est passé. Pour cela, il a fallu configurer la branche `master` sur GitHub en lui ajoutant deux règles :
* `Require status checks to pass before merging` : permet de vérifier que des statuts spécifiques soient passée avant de merger sur `master`
* `Require branches to be up to date before merging` : permet de s'assurer que la branche `master` a été testée avec la dernière version du code sur `master` 
