# TP CI/CD Antora

[![Build Status](https://travis-ci.com/MarieStretti/Antora.svg?branch=master)](https://travis-ci.com/MarieStretti/Antora)

* Les résultats des builds se trouvent ici : https://travis-ci.com/MarieStretti/Antora/
* La documentation générée est au lien suivant : https://mariestretti.github.io/Antora/

* Le dossier `ci-cd` contient le fichier `antora_playbook.yml` et le `README.md` créés pour ce projet d'intégration continue.

## Objectifs du TP

L'objectif principal de ce TP est de mettre en oeuvre de la livraison continue sur un projet. Pour cela, il fallait créer un pipeline avec trois étapes : Construire, Tests et Déployer.
L’intégration continue devra être un Pipeline effectuant :
3 étapes “de base”: Construire, Tests et Déployer:
L’étape “Construire” devra générer, en plus de l’application, un site web statique de documentation (type “maven site”)
L’étape “Déployer” devra déployer le site web statique pour chaque branche


## Outil de CI/CD utilisé

Travis CI

## Pipeline utilisé

Le pipeline est décrit dans le fichier `.travis.yml` à la racine du projet.

![Pipeline utilisé](https://github.com/MarieStretti/Antora/blob/master/ci-cd/pipeline.png)

## Stage Setup

Ce stage exécute trois commandes :
* `yarn install` : installation des dépendances yarn
* `npm install gulp-cli` : installation de gulp, qui contrairement à npm et yarn, n'est pas intégré dans Travis

## Stage Verify

Ce stage a pour but de faire passer les commandes de test.
Deux commandes ont été utilisées :
* `gulp lint` : correspond aux tests unitaires
* `gulp test` : correspond aux tests d'intégration

### Tests parallèles

Un des points à remplir était d'effectuer des tests d'intégration ou d'acceptance sur deux plateformes différentes. Pour ce projet, les tests d'intégration sont parallélisés sous deux versions de node js, node_js 10 et node_js 12. Cette mise en parallèle des tests se fait grâce à une matrice qui lie les stages et les versions de node.

## Stage Deploy

Ce stage consiste à déployer le site web statique pour chaque branche, c'est-à-dire la documentation générée par Antora grâce à la commande : `antora antora_playbook.yml`. Le résultat est stocké dans le dossier `docs` (lu par défaut par GitHub comme dossier de documentation) de la branche `master`. Il a fallu avant ça que je modifie le playbook.yml pour spécifier le dossier de sortie du résultat de la commande.

Le déploiement se fait sur la page GitHub (https://mariestretti.github.io/Antora/), sur la branche `gh-pages`.
Il reste cependant un petit bug : le ficher index.html n'arrive pas à faire le lien avec le fichier css, bien que ce dernier soit correctement généré...

## Pull/Merge request
Etant donné que Travis se met à builder la pipeline automatiquement une fois un push réalisé, il est essentiel de faire en sorte qu'un contributeur ne puisse pull ou merge seulement si le build est passé. Pour cela, il a fallu configurer la branche `master` sur GitHub en lui ajoutant deux règles :
* `Require status checks to pass before merging` : permet de vérifier que des statuts spécifiques soient passée avant de merger sur `master`
* `Require branches to be up to date before merging` : permet de s'assurer que la branche `master` a été testée avec la dernière version du code sur `master` 
* `Include administrators` : applique ces restrictions également pour les administrateurs

## JSDoc
Si l'on veut déployer la documentation avec JSDoc et non la documentation d'Antora avec le `antora_playbook.yml`, il faut utiliser la commande suivante à la place de *antora ./test_cicd_playbook/antora_playbook.yml* dans le stage `deploy`:
* `./node_modules/.bin/jsdoc scripts/*.js -d docs`
